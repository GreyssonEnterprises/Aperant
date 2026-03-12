/**
 * Rate Limit Retry Wrapper
 * ========================
 *
 * Wraps AI calls (streamText, generateText) with rate-limit-aware retry logic.
 * When all accounts are exhausted and the auto-swap middleware can't recover,
 * this utility waits for the rate limit to reset and retries the operation.
 *
 * Usage:
 * ```ts
 * const result = await withRateLimitRetry(
 *   () => generateText({ model, prompt, ... }),
 *   { signal: abortSignal, onWaiting: (ms) => onStream?.({ type: 'status', text: `Rate limited, waiting...` }) }
 * );
 * ```
 */

import { isRateLimitError } from './error-classifier';
import { extractWaitDuration, formatWaitDuration, sleepWithAbort } from './rate-limit-wait';

/** Maximum retries after rate limit waits */
const MAX_RATE_LIMIT_RETRIES = 3;

export interface RateLimitRetryOptions {
  /** Abort signal to cancel the wait */
  signal?: AbortSignal;
  /** Maximum retries (default: 3) */
  maxRetries?: number;
  /** Called when entering a rate-limit wait, with the wait duration in ms */
  onWaiting?: (waitMs: number, retryCount: number) => void;
  /** Called when a wait completes and the operation is being retried */
  onRetry?: (retryCount: number) => void;
}

/**
 * Execute an async operation with rate-limit-aware retry.
 *
 * If the operation throws a rate limit error (after the auto-swap middleware
 * has already exhausted its options), this waits for the reset and retries.
 * Weekly limits (too long to wait) are NOT retried — they throw immediately.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options?: RateLimitRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? MAX_RATE_LIMIT_RETRIES;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error)) {
        console.log('[AutoSwap:Retry] Non-rate-limit error — not retrying:', error instanceof Error ? error.message : String(error));
        throw error;
      }
      if (attempt >= maxRetries) {
        console.log('[AutoSwap:Retry] Max retries reached (' + maxRetries + ') — giving up');
        throw error;
      }

      const waitInfo = extractWaitDuration(error);
      // Weekly limits or unextractable — don't wait
      if (!waitInfo) {
        console.log('[AutoSwap:Retry] Cannot extract wait duration — not retrying (weekly limit?)');
        throw error;
      }

      console.log('[AutoSwap:Retry] Rate limit hit (attempt', attempt + 1 + '/' + maxRetries + '). Waiting', formatWaitDuration(waitInfo.waitMs), '(type:', waitInfo.limitType + ')');
      options?.onWaiting?.(waitInfo.waitMs, attempt + 1);

      const completed = await sleepWithAbort(waitInfo.waitMs, options?.signal);
      if (!completed) {
        console.log('[AutoSwap:Retry] Wait aborted — not retrying');
        throw error;
      }

      console.log('[AutoSwap:Retry] Wait complete — retrying (attempt', attempt + 2 + ')');
      options?.onRetry?.(attempt + 1);
    }
  }
}
