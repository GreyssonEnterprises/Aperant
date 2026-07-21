import { describe, expect, it, vi } from 'vitest';

import {
  createCodexExecutionBackend,
  type CodexExecutionManager,
  type CodexSessionMetadataStore,
} from './codex-execution-backend';

function createHarness(metadata?: {
  threadId: string;
  accountId: string;
  worktreePath: string;
  codexVersion: string;
  updatedAt: string;
}) {
  let notify: ((method: string, params: unknown) => void) | undefined;
  const unsubscribe = vi.fn(() => { notify = undefined; });
  const manager: CodexExecutionManager = {
    subscribe: vi.fn((_accountId, callback) => {
      notify = callback;
      return unsubscribe;
    }),
    getRuntimeVersion: vi.fn().mockResolvedValue('0.144.6'),
    startThread: vi.fn().mockResolvedValue({ threadId: 'thread-new', runtimeVersion: '0.144.6' }),
    resumeThread: vi.fn().mockResolvedValue({ threadId: 'thread-old', runtimeVersion: '0.144.6' }),
    startTurn: vi.fn().mockResolvedValue({ turnId: 'turn-1' }),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
    retireAccount: vi.fn().mockResolvedValue(undefined),
  };
  const store: CodexSessionMetadataStore = {
    read: vi.fn().mockResolvedValue(metadata),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const events: unknown[] = [];
  const backend = createCodexExecutionBackend({ manager, store, cancellationGraceMs: 5 });
  const config = {
    taskId: 'task-1',
    accountId: 'account-1',
    modelId: 'gpt-5.3-codex',
    reasoningEffort: 'high',
    systemPrompt: 'Implement the approved task. Aperant owns Git operations.',
    input: 'Work only in the task worktree.',
    worktreePath: '/worktree',
    specDir: '/worktree/specs/task-1',
    phase: 'coding',
  } as const;
  return {
    manager,
    store,
    backend,
    config,
    events,
    unsubscribe,
    emit: (event: unknown) => events.push(event),
    notify: (method: string, params: unknown) => notify?.(method, params),
  };
}

describe('Codex execution backend', () => {
  it('starts a fail-closed thread and persists session metadata', async () => {
    const h = createHarness();
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    expect(h.manager.startThread).toHaveBeenCalledWith('account-1', {
      cwd: '/worktree',
      model: 'gpt-5.3-codex',
      developerInstructions: expect.stringContaining(
        'Aperant owns Git metadata, worktrees, branches, commits, pushes, and pull requests.',
      ),
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      networkAccess: false,
    });
    expect(h.manager.startTurn).toHaveBeenCalledWith('account-1', {
      threadId: 'thread-new',
      input: 'Work only in the task worktree.',
      cwd: '/worktree',
      model: 'gpt-5.3-codex',
      reasoningEffort: 'high',
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'workspaceWrite', networkAccess: false, writableRoots: ['/worktree'],
        excludeTmpdirEnvVar: true, excludeSlashTmp: true,
      },
    });
    expect(h.store.write).toHaveBeenCalledWith('/worktree/specs/task-1', 'coding', expect.objectContaining({
      threadId: 'thread-new', accountId: 'account-1', worktreePath: '/worktree', codexVersion: '0.144.6',
    }));

    h.notify('turn/completed', { threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] } });
    await expect(run).resolves.toMatchObject({ outcome: 'completed' });
  });

  it('resumes only when account, worktree, and runtime version match', async () => {
    const h = createHarness({
      threadId: 'thread-old', accountId: 'account-1', worktreePath: '/worktree',
      codexVersion: '0.144.6', updatedAt: '2026-07-21T00:00:00.000Z',
    });
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    expect(h.manager.resumeThread).toHaveBeenCalledWith('account-1', expect.objectContaining({
      threadId: 'thread-old', cwd: '/worktree', approvalPolicy: 'never',
      sandbox: 'workspace-write', networkAccess: false,
    }));
    expect(h.manager.startThread).not.toHaveBeenCalled();
    h.notify('turn/completed', { threadId: 'thread-old', turn: { id: 'turn-1', status: 'completed', items: [] } });
    await run;
  });

  it('starts fresh with a warning when resume invariants do not match', async () => {
    const h = createHarness({
      threadId: 'thread-old', accountId: 'other-account', worktreePath: '/worktree',
      codexVersion: '0.144.6', updatedAt: '2026-07-21T00:00:00.000Z',
    });
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    expect(h.manager.startThread).toHaveBeenCalled();
    expect(h.manager.resumeThread).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      type: 'warning', message: 'Saved Codex session did not match this account, worktree, or runtime; started a fresh session',
    });
    h.notify('turn/completed', { threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] } });
    await run;
  });

  it('does not send thread/resume when the installed runtime version changed', async () => {
    const h = createHarness({
      threadId: 'thread-old', accountId: 'account-1', worktreePath: '/worktree',
      codexVersion: '0.143.9', updatedAt: '2026-07-21T00:00:00.000Z',
    });
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    expect(h.manager.resumeThread).not.toHaveBeenCalled();
    expect(h.manager.startThread).toHaveBeenCalled();
    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    await run;
  });

  it('returns parsed structured output from the completed agent message', async () => {
    const h = createHarness();
    const run = h.backend.run({ ...h.config, outputSchema: { type: 'object' } }, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    h.notify('item/completed', {
      threadId: 'thread-new', turnId: 'turn-1',
      item: { id: 'message-1', type: 'agentMessage', text: '{"status":"done"}' },
    });
    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    await expect(run).resolves.toMatchObject({ structuredOutput: { status: 'done' } });
    expect(h.manager.startTurn).toHaveBeenCalledWith('account-1', expect.objectContaining({
      outputSchema: { type: 'object' },
    }));
  });

  it('interrupts then cooperatively retires an unresponsive account server', async () => {
    const h = createHarness();
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    const cancellation = h.backend.cancel();
    await expect(cancellation).resolves.toBeUndefined();
    expect(h.manager.interruptTurn).toHaveBeenCalledWith('account-1', 'thread-new', 'turn-1');
    expect(h.manager.retireAccount).toHaveBeenCalledWith('account-1');
    await expect(run).resolves.toMatchObject({ outcome: 'cancelled' });
  });

  it('returns a retryable failure when cooperative retirement cannot prove exit', async () => {
    const h = createHarness();
    vi.mocked(h.manager.retireAccount).mockRejectedValueOnce(new Error('private transport detail'));
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    await h.backend.cancel();
    await expect(run).resolves.toMatchObject({
      outcome: 'error',
      error: { code: 'termination-failed', message: 'Codex session could not be stopped safely', retryable: true },
    });
    expect(JSON.stringify(h.events)).not.toContain('private transport detail');
  });

  it('unsubscribes when turn startup fails', async () => {
    const h = createHarness();
    vi.mocked(h.manager.startTurn).mockRejectedValueOnce(new Error('private startup detail'));

    await expect(h.backend.run(h.config, h.emit)).rejects.toThrow('private startup detail');

    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.backend.isActive).toBe(false);
  });
});
