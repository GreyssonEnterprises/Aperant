import { describe, expect, it, vi } from 'vitest';

import {
  createCodexExecutionBackend,
  type CodexExecutionManager,
  type CodexSessionMetadata,
  type CodexSessionMetadataStore,
} from './codex-execution-backend';

function createHarness(
  metadata?: CodexSessionMetadata,
  canonicalizePath: (value: string) => Promise<string> = async (value) => value,
) {
  let notify: ((method: string, params: unknown) => void) | undefined;
  let notifyLifecycle: ((event: { type: 'process-death' | 'retiring'; retryable: true }) => void) | undefined;
  const unsubscribe = vi.fn(() => { notify = undefined; });
  const manager: CodexExecutionManager = {
    subscribe: vi.fn((_accountId, callback) => {
      notify = callback;
      return unsubscribe;
    }),
    subscribeLifecycle: vi.fn((_accountId, callback) => {
      notifyLifecycle = callback;
      return () => { notifyLifecycle = undefined; };
    }),
    verifyExecutionModel: vi.fn().mockResolvedValue(undefined),
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
  const backend = createCodexExecutionBackend({
    manager,
    store,
    cancellationGraceMs: 5,
    canonicalizePath,
  });
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
    notifyLifecycle: (event: { type: 'process-death' | 'retiring'; retryable: true }) =>
      notifyLifecycle?.(event),
  };
}

describe('Codex execution backend', () => {
  it('claims startup before the first await and rejects duplicate runs', async () => {
    const h = createHarness();
    let releaseRead!: () => void;
    vi.mocked(h.store.read).mockReturnValueOnce(new Promise((resolve) => {
      releaseRead = () => resolve(undefined);
    }));

    const first = h.backend.run(h.config, h.emit);
    const duplicate = h.backend.run(h.config, h.emit);

    await expect(Promise.race([
      duplicate.then(() => 'resolved', () => 'rejected'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 10)),
    ])).resolves.toBe('rejected');
    expect(h.store.read).toHaveBeenCalledTimes(1);

    releaseRead();
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    await first;
  });

  it('fences cancellation during startup before creating a thread', async () => {
    const h = createHarness();
    let releaseVersion!: () => void;
    vi.mocked(h.manager.getRuntimeVersion).mockReturnValueOnce(new Promise((resolve) => {
      releaseVersion = () => resolve('0.144.6');
    }));

    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.getRuntimeVersion).toHaveBeenCalled());
    const cancellation = h.backend.cancel();
    releaseVersion();

    await expect(Promise.race([
      run.then((result) => result.outcome),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 20)),
    ])).resolves.toBe('cancelled');
    await cancellation;
    expect(h.manager.startThread).not.toHaveBeenCalled();
    expect(h.manager.resumeThread).not.toHaveBeenCalled();
    expect(h.manager.startTurn).not.toHaveBeenCalled();
  });

  it('settles retryably when the shared account process dies', async () => {
    const h = createHarness();
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    h.notifyLifecycle({ type: 'process-death', retryable: true });

    await expect(run).resolves.toMatchObject({
      outcome: 'error',
      error: { code: 'account-process-ended', retryable: true },
    });
  });

  it('settles every task sharing an account when cancellation escalates to retirement', async () => {
    const notifications = new Set<(method: string, params: unknown) => void>();
    const lifecycle = new Set<(event: { type: 'process-death' | 'retiring'; retryable: true }) => void>();
    let threadSequence = 0;
    let turnSequence = 0;
    const manager: CodexExecutionManager = {
      subscribe: vi.fn((_accountId, callback) => {
        notifications.add(callback);
        return () => { notifications.delete(callback); };
      }),
      subscribeLifecycle: vi.fn((_accountId, callback) => {
        lifecycle.add(callback);
        return () => { lifecycle.delete(callback); };
      }),
      verifyExecutionModel: vi.fn().mockResolvedValue(undefined),
      getRuntimeVersion: vi.fn().mockResolvedValue('0.144.6'),
      startThread: vi.fn(async () => ({
        threadId: `thread-${++threadSequence}`, runtimeVersion: '0.144.6',
      })),
      resumeThread: vi.fn(),
      startTurn: vi.fn(async () => ({ turnId: `turn-${++turnSequence}` })),
      interruptTurn: vi.fn().mockResolvedValue(undefined),
      retireAccount: vi.fn(async () => {
        for (const listener of [...lifecycle]) listener({ type: 'retiring', retryable: true });
      }),
    };
    const store: CodexSessionMetadataStore = {
      read: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const first = createCodexExecutionBackend({
      manager, store, cancellationGraceMs: 1, canonicalizePath: async (value) => value,
    });
    const second = createCodexExecutionBackend({
      manager, store, cancellationGraceMs: 1, canonicalizePath: async (value) => value,
    });
    const base = createHarness().config;
    const firstRun = first.run(base, vi.fn());
    const secondRun = second.run({
      ...base, taskId: 'task-2', worktreePath: '/worktree-2', specDir: '/worktree-2/specs/task-2',
    }, vi.fn());
    await vi.waitFor(() => expect(manager.startTurn).toHaveBeenCalledTimes(2));

    const cancelled = first.cancel();

    await expect(cancelled).resolves.toMatchObject({
      outcome: 'error', error: { code: 'account-retired', retryable: true },
    });
    await expect(firstRun).resolves.toMatchObject({ outcome: 'error' });
    await expect(secondRun).resolves.toMatchObject({
      outcome: 'error', error: { code: 'account-retired', retryable: true },
    });
    expect(manager.interruptTurn).toHaveBeenCalledWith('account-1', 'thread-1', 'turn-1');
    expect(manager.interruptTurn).not.toHaveBeenCalledWith('account-1', 'thread-2', 'turn-2');
  });

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
      runtimeWorkspaceRoots: ['/worktree'],
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
      runtimeWorkspaceRoots: ['/worktree'],
    });
    expect(h.store.write).toHaveBeenCalledWith('/worktree/specs/task-1', 'coding', expect.objectContaining({
      schemaVersion: 1, threadId: 'thread-new', accountId: 'account-1',
      modelId: 'gpt-5.3-codex', worktreePath: '/worktree', codexVersion: '0.144.6',
    }));
    expect(h.manager.verifyExecutionModel).toHaveBeenCalledWith(
      'account-1', 'gpt-5.3-codex', 'high',
    );

    h.notify('turn/completed', { threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] } });
    await expect(run).resolves.toMatchObject({ outcome: 'completed' });
  });

  it('resumes only when account, worktree, and runtime version match', async () => {
    const h = createHarness({
      schemaVersion: 1,
      threadId: 'thread-old', accountId: 'account-1', worktreePath: '/worktree',
      modelId: 'gpt-5.3-codex',
      codexVersion: '0.144.0', updatedAt: '2026-07-21T00:00:00.000Z',
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

  it('starts fresh when the persisted model does not match', async () => {
    const h = createHarness({
      schemaVersion: 1,
      threadId: 'thread-old', accountId: 'account-1', worktreePath: '/worktree',
      modelId: 'gpt-5.2-codex', codexVersion: '0.144.6',
      updatedAt: '2026-07-21T00:00:00.000Z',
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

  it('uses canonical paths for containment, persistence, and execution', async () => {
    const canonicalizePath = vi.fn(async (value: string) => ({
      '/alias/worktree': '/real/worktree',
      '/alias/worktree/specs/task-1': '/real/worktree/specs/task-1',
    })[value] ?? value);
    const h = createHarness(undefined, canonicalizePath);
    const config = {
      ...h.config,
      worktreePath: '/alias/worktree',
      specDir: '/alias/worktree/specs/task-1',
    };
    const run = h.backend.run(config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    expect(h.store.read).toHaveBeenCalledWith('/real/worktree/specs/task-1', 'coding');
    expect(h.manager.startThread).toHaveBeenCalledWith('account-1', expect.objectContaining({
      cwd: '/real/worktree', runtimeWorkspaceRoots: ['/real/worktree'],
    }));
    expect(h.store.write).toHaveBeenCalledWith(
      '/real/worktree/specs/task-1',
      'coding',
      expect.objectContaining({ worktreePath: '/real/worktree' }),
    );
    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    await run;
  });

  it('rejects a spec directory that resolves outside the canonical worktree', async () => {
    const h = createHarness(undefined, async (value) => (
      value === '/worktree' ? '/real/worktree' : '/outside/specs/task-1'
    ));

    await expect(h.backend.run(h.config, h.emit)).rejects.toThrow(
      'Codex spec directory must be inside the task worktree',
    );
    expect(h.store.read).not.toHaveBeenCalled();
    expect(h.manager.getRuntimeVersion).not.toHaveBeenCalled();
  });

  it('starts fresh with a warning when resume invariants do not match', async () => {
    const h = createHarness({
      schemaVersion: 1,
      threadId: 'thread-old', accountId: 'other-account', worktreePath: '/worktree',
      modelId: 'gpt-5.3-codex',
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
      schemaVersion: 1,
      threadId: 'thread-old', accountId: 'account-1', worktreePath: '/worktree',
      modelId: 'gpt-5.3-codex',
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

  it('does not return structured output containing prototype keys', async () => {
    const h = createHarness();
    const run = h.backend.run({ ...h.config, outputSchema: { type: 'object' } }, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());
    h.notify('item/completed', {
      threadId: 'thread-new', turnId: 'turn-1',
      item: {
        id: 'message-1', type: 'agentMessage',
        text: '{"status":"done","constructor":{"prototype":{"polluted":true}}}',
      },
    });
    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    await expect(run).resolves.not.toHaveProperty('structuredOutput');
  });

  it('stops the startup notification queue and live delivery after a terminal event', async () => {
    const h = createHarness();
    let releaseTurn!: () => void;
    vi.mocked(h.manager.startTurn).mockReturnValueOnce(new Promise((resolve) => {
      releaseTurn = () => resolve({ turnId: 'turn-1' });
    }));
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    h.notify('turn/completed', {
      threadId: 'thread-new', turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    h.notify('item/agentMessage/delta', {
      threadId: 'thread-new', turnId: 'turn-1', itemId: 'message-1',
      delta: 'must-not-emit-after-terminal',
    });
    releaseTurn();
    await expect(run).resolves.toMatchObject({ outcome: 'completed' });

    expect(h.events).toEqual([{ type: 'terminal', status: 'completed' }]);
    h.notify('item/agentMessage/delta', {
      threadId: 'thread-new', turnId: 'turn-1', itemId: 'message-1',
      delta: 'must-not-emit-after-settlement',
    });
    expect(JSON.stringify(h.events)).not.toContain('must-not-emit');
  });

  it('interrupts then returns retryable finalization after retiring an unresponsive server', async () => {
    const h = createHarness();
    const run = h.backend.run(h.config, h.emit);
    await vi.waitFor(() => expect(h.manager.startTurn).toHaveBeenCalled());

    const cancellation = h.backend.cancel();
    await expect(cancellation).resolves.toMatchObject({
      outcome: 'error', error: { code: 'account-retired', retryable: true },
    });
    expect(h.manager.interruptTurn).toHaveBeenCalledWith('account-1', 'thread-new', 'turn-1');
    expect(h.manager.retireAccount).toHaveBeenCalledWith('account-1');
    await expect(run).resolves.toMatchObject({
      outcome: 'error',
      error: { code: 'account-retired', retryable: true },
    });
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
