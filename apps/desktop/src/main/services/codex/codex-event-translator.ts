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

const MAX_TEXT_DELTA_BYTES = 32 * 1024;
const MAX_COMPLETED_MESSAGE_BYTES = 256 * 1024;
const MAX_TOOL_ID_LENGTH = 128;

function boundedText(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let result = Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8');
  while (Buffer.byteLength(result, 'utf8') > maxBytes) result = result.slice(0, -1);
  return result;
}

function matchesTurn(params: Record<string, unknown>, context: CodexNotificationContext): boolean {
  return params.threadId === context.threadId && params.turnId === context.turnId;
}

function matchesThread(params: Record<string, unknown>, context: CodexNotificationContext): boolean {
  return params.threadId === context.threadId &&
    (params.turnId === undefined || params.turnId === context.turnId);
}

function safeToolId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TOOL_ID_LENGTH) {
    return undefined;
  }
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : undefined;
}

function fileCount(item: Record<string, unknown>): number {
  return Array.isArray(item.changes) ? Math.min(item.changes.length, 10_000) : 0;
}

function durationMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, 86_400_000)
    : 0;
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
  return { code: 'codex-error', message: 'Codex turn failed' };
}

function translateItem(method: string, params: Record<string, unknown>): CodexTranslatedEvent[] {
  const item = record(params.item);
  if (!item || typeof item.type !== 'string') return [];
  const toolCallId = safeToolId(item.id);
  if (!toolCallId) return [];
  const started = method === 'item/started';
  if (item.type === 'commandExecution') {
    if (started) {
      return [{
        type: 'stream-event',
        data: {
          type: 'tool-call',
          toolName: 'bash',
          toolCallId,
          args: { status: 'started' },
        },
      }];
    }
    const exitCode = typeof item.exitCode === 'number' && Number.isSafeInteger(item.exitCode)
      ? item.exitCode
      : null;
    const status = item.status === 'failed' ? 'failed' : 'completed';
    return [{
      type: 'stream-event',
      data: {
        type: 'tool-result',
        toolName: 'bash',
        toolCallId,
        result: { exitCode, status },
        durationMs: durationMs(item.durationMs),
        isError: status === 'failed' || exitCode !== null && exitCode !== 0,
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
          toolCallId,
          args: { fileCount: fileCount(item) },
        },
      }];
    }
    return [{
      type: 'stream-event',
      data: {
        type: 'tool-result',
        toolName: 'apply_patch',
        toolCallId,
        result: {
          fileCount: fileCount(item),
          status: item.status === 'failed' ? 'failed' : 'completed',
        },
        durationMs: 0,
        isError: item.status === 'failed',
      },
    }];
  }
  if (!started && item.type === 'agentMessage' && typeof item.text === 'string') {
    return [{
      type: 'message-completed',
      text: boundedText(item.text, MAX_COMPLETED_MESSAGE_BYTES),
    }];
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
  if (method === 'turn/completed') {
    if (params.threadId !== context.threadId) return [];
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
        events.push({
          type: 'message-completed',
          text: boundedText(message.text, MAX_COMPLETED_MESSAGE_BYTES),
        });
      }
    }
    events.push({
      type: 'terminal',
      status: turn.status as 'completed' | 'interrupted' | 'failed',
      ...(error ? { error: 'Codex turn failed' } : {}),
    });
    return events;
  }
  if (method === 'warning' || method === 'config/warning') {
    if (!matchesThread(params, context)) return [];
    return [{
      type: 'warning',
      message: method === 'config/warning'
        ? 'Codex reported a configuration warning'
        : 'Codex reported a warning',
    }];
  }
  if (!matchesTurn(params, context)) return [];

  if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    return [{
      type: 'stream-event',
      data: { type: 'text-delta', text: boundedText(params.delta, MAX_TEXT_DELTA_BYTES) },
    }];
  }
  if (method === 'item/commandExecution/outputDelta') return [];
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
  return [];
}
