import { describe, expect, it } from 'vitest';

import { translateCodexNotification } from './codex-event-translator';

const context = { threadId: 'thread-1', turnId: 'turn-1' };

describe('Codex execution event translation', () => {
  it('translates agent message deltas without exposing raw RPC data', () => {
    expect(translateCodexNotification('item/agentMessage/delta', {
      ...context,
      itemId: 'message-1',
      delta: 'Implemented the change.',
      rawSecret: 'must-not-cross',
    }, context)).toEqual([
      { type: 'stream-event', data: { type: 'text-delta', text: 'Implemented the change.' } },
    ]);
  });

  it('translates command and file lifecycle notifications', () => {
    expect(translateCodexNotification('item/started', {
      ...context,
      startedAtMs: 10,
      item: {
        type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/worktree',
        status: 'inProgress', commandActions: [],
      },
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'tool-call', toolName: 'bash', toolCallId: 'cmd-1',
          args: { command: 'npm test', cwd: '/worktree' },
        },
      },
    ]);

    expect(translateCodexNotification('item/completed', {
      ...context,
      item: {
        type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/worktree',
        status: 'completed', commandActions: [], exitCode: 0, durationMs: 25,
        aggregatedOutput: 'ok',
      },
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'tool-result', toolName: 'bash', toolCallId: 'cmd-1',
          result: { exitCode: 0, output: 'ok' }, durationMs: 25, isError: false,
        },
      },
    ]);

    expect(translateCodexNotification('item/started', {
      ...context,
      startedAtMs: 11,
      item: {
        type: 'fileChange', id: 'patch-1', status: 'inProgress',
        changes: [{ path: '/worktree/src/a.ts', kind: { type: 'update' } }],
      },
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'tool-call', toolName: 'apply_patch', toolCallId: 'patch-1',
          args: { files: ['/worktree/src/a.ts'] },
        },
      },
    ]);
  });

  it('translates errors, usage, rate limits, warnings, and terminal status', () => {
    expect(translateCodexNotification('error', {
      ...context,
      error: { message: 'temporary provider failure', codexErrorInfo: 'serverOverloaded' },
      willRetry: true,
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'error',
          error: {
            code: 'serverOverloaded', message: 'Codex service is temporarily overloaded',
            retryable: true,
          },
        },
      },
    ]);

    expect(translateCodexNotification('thread/tokenUsage/updated', {
      ...context,
      tokenUsage: {
        total: {
          inputTokens: 100, outputTokens: 40, totalTokens: 140,
          reasoningOutputTokens: 10, cachedInputTokens: 20,
        },
        last: {
          inputTokens: 20, outputTokens: 10, totalTokens: 30,
          reasoningOutputTokens: 5, cachedInputTokens: 3,
        },
      },
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'usage-update',
          usage: {
            promptTokens: 100, completionTokens: 40, totalTokens: 140,
            thinkingTokens: 10, cacheReadTokens: 20,
          },
        },
      },
    ]);

    expect(translateCodexNotification('account/rateLimits/updated', {
      rateLimits: { rateLimitReachedType: 'rate_limit_reached', primary: { usedPercent: 100 } },
    }, context)).toEqual([
      { type: 'rate-limit', message: 'Codex account rate limit reached', retryable: true },
    ]);

    expect(translateCodexNotification('warning', {
      threadId: 'thread-1', message: 'Model was rerouted',
    }, context)).toEqual([{ type: 'warning', message: 'Model was rerouted' }]);

    expect(translateCodexNotification('turn/completed', {
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    }, context)).toEqual([{ type: 'terminal', status: 'completed' }]);
  });

  it('ignores notifications for a different thread or turn', () => {
    expect(translateCodexNotification('item/agentMessage/delta', {
      threadId: 'other', turnId: 'turn-1', itemId: 'message-1', delta: 'wrong task',
    }, context)).toEqual([]);
    expect(translateCodexNotification('turn/completed', {
      threadId: 'thread-1', turn: { id: 'other', status: 'completed', items: [] },
    }, context)).toEqual([]);
  });

  it('does not expose raw provider details from a failed terminal notification', () => {
    const events = translateCodexNotification('turn/completed', {
      threadId: 'thread-1',
      turn: {
        id: 'turn-1',
        status: 'failed',
        error: { message: 'Bearer secret-token private transport detail' },
      },
    }, context);

    expect(events).toEqual([{
      type: 'terminal',
      status: 'failed',
      error: 'Codex turn failed',
    }]);
    expect(JSON.stringify(events)).not.toContain('secret-token');
  });
});
