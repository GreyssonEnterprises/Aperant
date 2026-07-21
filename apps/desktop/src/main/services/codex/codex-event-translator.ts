import type { StreamEvent } from '../../ai/session/types';

export interface CodexNotificationContext {
  threadId: string;
  turnId: string;
}

export type CodexTranslatedEvent =
  | { type: 'stream-event'; data: StreamEvent }
  | { type: 'warning'; message: string }
  | { type: 'message-completed'; text: string }
  | { type: 'rate-limit'; message: string; retryable: true }
  | { type: 'terminal'; status: 'completed' | 'interrupted' | 'failed'; error?: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function matches(params: Record<string, unknown>, context: CodexNotificationContext): boolean {
  if (typeof params.threadId === 'string' && params.threadId !== context.threadId) return false;
  if (typeof params.turnId === 'string' && params.turnId !== context.turnId) return false;
  return true;
}

function itemFiles(item: Record<string, unknown>): string[] {
  if (!Array.isArray(item.changes)) return [];
  return item.changes.flatMap((change) => {
    const value = record(change);
    return value && typeof value.path === 'string' ? [value.path] : [];
  });
}

function publicTurnError(code: unknown): { code: string; message: string } {
  if (code === 'unauthorized') {
    return { code, message: 'Codex subscription authentication is required' };
  }
  if (code === 'usageLimitExceeded' || code === 'sessionBudgetExceeded') {
    return { code, message: 'Codex account usage limit reached' };
  }
  if (code === 'serverOverloaded') {
    return { code, message: 'Codex service is temporarily overloaded' };
  }
  return { code: typeof code === 'string' ? code : 'codex-error', message: 'Codex turn failed' };
}

function translateItem(method: string, params: Record<string, unknown>): CodexTranslatedEvent[] {
  const item = record(params.item);
  if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') return [];
  const started = method === 'item/started';
  if (item.type === 'commandExecution') {
    if (typeof item.command !== 'string' || typeof item.cwd !== 'string') return [];
    if (started) {
      return [{
        type: 'stream-event',
        data: {
          type: 'tool-call',
          toolName: 'bash',
          toolCallId: item.id,
          args: { command: item.command, cwd: item.cwd },
        },
      }];
    }
    const exitCode = typeof item.exitCode === 'number' ? item.exitCode : null;
    return [{
      type: 'stream-event',
      data: {
        type: 'tool-result',
        toolName: 'bash',
        toolCallId: item.id,
        result: {
          exitCode,
          output: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
        },
        durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
        isError: item.status === 'failed' || exitCode !== null && exitCode !== 0,
      },
    }];
  }
  if (item.type === 'fileChange') {
    if (started) {
      return [{
        type: 'stream-event',
        data: {
          type: 'tool-call',
          toolName: 'apply_patch',
          toolCallId: item.id,
          args: { files: itemFiles(item) },
        },
      }];
    }
    return [{
      type: 'stream-event',
      data: {
        type: 'tool-result',
        toolName: 'apply_patch',
        toolCallId: item.id,
        result: { files: itemFiles(item), status: item.status },
        durationMs: 0,
        isError: item.status === 'failed',
      },
    }];
  }
  if (!started && item.type === 'agentMessage' && typeof item.text === 'string') {
    return [{ type: 'message-completed', text: item.text }];
  }
  return [];
}

export function translateCodexNotification(
  method: string,
  value: unknown,
  context: CodexNotificationContext,
): CodexTranslatedEvent[] {
  const params = record(value);
  if (!params) return [];

  if (method === 'account/rateLimits/updated') {
    const limits = record(params.rateLimits);
    if (!limits || limits.rateLimitReachedType === null ||
      limits.rateLimitReachedType === undefined) return [];
    return [{ type: 'rate-limit', message: 'Codex account rate limit reached', retryable: true }];
  }
  if (!matches(params, context)) return [];

  if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    return [{ type: 'stream-event', data: { type: 'text-delta', text: params.delta } }];
  }
  if (method === 'item/commandExecution/outputDelta' && typeof params.delta === 'string') {
    return [{ type: 'stream-event', data: { type: 'text-delta', text: params.delta } }];
  }
  if (method === 'item/started' || method === 'item/completed') {
    return translateItem(method, params);
  }
  if (method === 'error') {
    const error = record(params.error);
    if (!error || typeof error.message !== 'string') return [];
    const publicError = publicTurnError(error.codexErrorInfo);
    return [{
      type: 'stream-event',
      data: {
        type: 'error',
          error: { ...publicError, retryable: params.willRetry === true },
      },
    }];
  }
  if (method === 'thread/tokenUsage/updated') {
    const usage = record(params.tokenUsage);
    const total = record(usage?.total);
    if (!total || !['inputTokens', 'outputTokens', 'totalTokens'].every(
      (key) => typeof total[key] === 'number',
    )) return [];
    return [{
      type: 'stream-event',
      data: {
        type: 'usage-update',
        usage: {
          promptTokens: total.inputTokens as number,
          completionTokens: total.outputTokens as number,
          totalTokens: total.totalTokens as number,
          ...(typeof total.reasoningOutputTokens === 'number'
            ? { thinkingTokens: total.reasoningOutputTokens }
            : {}),
          ...(typeof total.cachedInputTokens === 'number'
            ? { cacheReadTokens: total.cachedInputTokens }
            : {}),
        },
      },
    }];
  }
  if (method === 'warning' && typeof params.message === 'string') {
    return [{ type: 'warning', message: params.message }];
  }
  if (method === 'config/warning' && typeof params.summary === 'string') {
    return [{ type: 'warning', message: params.summary }];
  }
  if (method === 'turn/completed') {
    const turn = record(params.turn);
    if (!turn || turn.id !== context.turnId ||
      !['completed', 'interrupted', 'failed'].includes(turn.status as string)) return [];
    const error = record(turn.error);
    const events: CodexTranslatedEvent[] = [];
    if (Array.isArray(turn.items)) {
      const message = [...turn.items].reverse().map(record).find(
        (item) => item?.type === 'agentMessage' && typeof item.text === 'string',
      );
      if (message && typeof message.text === 'string') {
        events.push({ type: 'message-completed', text: message.text });
      }
    }
    events.push({
      type: 'terminal',
      status: turn.status as 'completed' | 'interrupted' | 'failed',
      ...(error ? { error: 'Codex turn failed' } : {}),
    });
    return events;
  }
  return [];
}
