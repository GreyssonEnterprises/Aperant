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

  it('emits only redacted, bounded command and file lifecycle metadata', () => {
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
          args: { status: 'started' },
        },
      },
    ]);

    expect(translateCodexNotification('item/completed', {
      ...context,
      item: {
        type: 'fileChange', id: 'patch-1', status: 'completed',
        changes: [{ path: '/worktree/src/a.ts', kind: { type: 'update' } }],
      },
    }, context)).toEqual([
      {
        type: 'stream-event',
        data: {
          type: 'tool-result', toolName: 'apply_patch', toolCallId: 'patch-1',
          result: { fileCount: 1, status: 'completed' }, durationMs: 0, isError: false,
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
          result: { exitCode: 0, status: 'completed' }, durationMs: 25, isError: false,
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
          args: { fileCount: 1 },
        },
      },
    ]);

    const serialized = JSON.stringify([
      ...translateCodexNotification('item/started', {
        ...context,
        item: {
          type: 'commandExecution', id: 'cmd-1', command: 'printf super-secret',
          cwd: '/private/secret', status: 'inProgress',
        },
      }, context),
      ...translateCodexNotification('item/completed', {
        ...context,
        item: {
          type: 'commandExecution', id: 'cmd-1', command: 'printf super-secret',
          cwd: '/private/secret', status: 'completed', exitCode: 0,
          aggregatedOutput: 'super-secret command output',
        },
      }, context),
    ]);
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('/private');
  });

  it('drops command output and hidden reasoning deltas', () => {
    expect(translateCodexNotification('item/commandExecution/outputDelta', {
      ...context, itemId: 'cmd-1', delta: 'secret command output',
    }, context)).toEqual([]);
    expect(translateCodexNotification('item/reasoning/summaryTextDelta', {
      ...context, itemId: 'reasoning-1', delta: 'private chain of thought',
    }, context)).toEqual([]);
    expect(translateCodexNotification('item/reasoning/textDelta', {
      ...context, itemId: 'reasoning-1', delta: 'private chain of thought',
    }, context)).toEqual([]);
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
      threadId: 'thread-1', message: 'Secret at /private/path was rerouted',
    }, context)).toEqual([{ type: 'warning', message: 'Codex reported a warning' }]);

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

  it('requires complete thread and turn identity for turn-scoped events', () => {
    expect(translateCodexNotification('item/agentMessage/delta', {
      threadId: 'thread-1', itemId: 'message-1', delta: 'missing turn identity',
    }, context)).toEqual([]);
    expect(translateCodexNotification('item/agentMessage/delta', {
      turnId: 'turn-1', itemId: 'message-1', delta: 'missing thread identity',
    }, context)).toEqual([]);
    expect(translateCodexNotification('thread/tokenUsage/updated', {
      threadId: 'thread-1', tokenUsage: {
        total: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    }, context)).toEqual([]);
    expect(translateCodexNotification('turn/completed', {
      turn: { id: 'turn-1', status: 'completed', items: [] },
    }, context)).toEqual([]);
  });

  it('bounds assistant text and rejects unsafe lifecycle identifiers', () => {
    const longDelta = 'x'.repeat(40_000);
    const events = translateCodexNotification('item/agentMessage/delta', {
      ...context, itemId: 'message-1', delta: longDelta,
    }, context);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'stream-event', data: { type: 'text-delta' } });
    if (events[0]?.type === 'stream-event' && events[0].data.type === 'text-delta') {
      expect(Buffer.byteLength(events[0].data.text, 'utf8')).toBeLessThanOrEqual(32 * 1024);
    }

    expect(translateCodexNotification('item/started', {
      ...context,
      item: { type: 'commandExecution', id: 'unsafe id /private/path', status: 'inProgress' },
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
