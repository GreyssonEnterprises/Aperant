/**
 * Rate Limit Wait-and-Retry
 * =========================
 *
 * Shared utility for extracting wait duration from rate limit errors
 * and sleeping with cancellation support.
 *
 * Used by both:
 * - Session runner (task pipeline: planner, coder, QA)
 * - Auto-swap middleware (standalone runners: insights, roadmap, PR review, etc.)
 *
 * When a 429 occurs and no swap target is available, this module extracts
 * how long to wait from the error and sleeps until the rate limit resets.
 */

import { APICallError } from '@ai-sdk/provider';
import { parseResetTime, classifyRateLimitType } from '../../claude-profile/usage-parser';

// =============================================================================
// Constants
// =============================================================================

/** Maximum time to auto-wait for a rate limit reset (30 minutes) */
const MAX_RATE_LIMIT_WAIT_MS = 30 * 60 * 1000;

/** Default wait time when no reset info is available (5 minutes) */
const DEFAULT_WAIT_MS = 5 * 60 * 1000;

/** Minimum wait time to avoid tight retry loops (30 seconds) */
const MIN_WAIT_MS = 30 * 1000;

// =============================================================================
// Types
// =============================================================================

export interface WaitDurationInfo {
  /** How long to wait in milliseconds */
  waitMs: number;
  /** When the rate limit resets (if known) */
  resetAt: Date | null;
  /** Whether this is a session or weekly limit */
  limitType: 'session' | 'weekly';
}

// =============================================================================
// Wait Duration Extraction
// =============================================================================

/**
 * Extract wait duration from a rate limit error.
 *
 * Priority order:
 * 1. `Retry-After` header (seconds or HTTP-date)
 * 2. Reset time string from error message (e.g., "resets Dec 17 at 6am")
 * 3. Fallback: 5 minutes
 *
 * Returns null for weekly limits (too long to auto-wait).
 */
export function extractWaitDuration(error: unknown): WaitDurationInfo | null {
  // Try Retry-After header from APICallError
  const headerWait = extractFromRetryAfterHeader(error);
  if (headerWait) return headerWait;

  // Try reset time from error message
  const messageWait = extractFromErrorMessage(error);
  if (messageWait) return messageWait;

  // Fallback: 5 minutes (safe default for session limits)
  return {
    waitMs: DEFAULT_WAIT_MS,
    resetAt: new Date(Date.now() + DEFAULT_WAIT_MS),
    limitType: 'session',
  };
}

/**
 * Extract wait duration from Retry-After response header.
 * Supports both seconds (e.g., "120") and HTTP-date (e.g., "Thu, 01 Dec 2025 16:00:00 GMT").
 */
function extractFromRetryAfterHeader(error: unknown): WaitDurationInfo | null {
  if (!APICallError.isInstance(error)) return null;
  const retryAfter = error.responseHeaders?.['retry-after'];
  if (!retryAfter) return null;

  // Try as seconds
  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds) && seconds > 0) {
    const waitMs = clampWaitMs(seconds * 1000);
    return {
      waitMs,
      resetAt: new Date(Date.now() + waitMs),
      limitType: 'session',
    };
  }

  // Try as HTTP-date
  const date = new Date(retryAfter);
  if (!Number.isNaN(date.getTime())) {
    const waitMs = clampWaitMs(date.getTime() - Date.now());
    return {
      waitMs,
      resetAt: date,
      limitType: 'session',
    };
  }

  return null;
}

/**
 * Extract wait duration from error message patterns.
 * Looks for reset time strings like "resets Dec 17 at 6am (Europe/Oslo)".
 */
function extractFromErrorMessage(error: unknown): WaitDurationInfo | null {
  const message = error instanceof Error ? error.message : String(error);

  // Look for reset time pattern: "resets <datetime>" or "Resets <datetime>"
  const resetMatch = message.match(/resets?\s+(.+?)(?:\s*\.|$|\n)/i);
  if (!resetMatch) return null;

  const resetTimeStr = resetMatch[1].trim();
  const limitType = classifyRateLimitType(resetTimeStr);

  // Don't auto-wait for weekly limits — too long
  if (limitType === 'weekly') return null;

  const resetAt = parseResetTime(resetTimeStr);
  const waitMs = clampWaitMs(resetAt.getTime() - Date.now());

  return { waitMs, resetAt, limitType };
}

// =============================================================================
// Sleep with Abort
// =============================================================================

/**
 * Sleep for the given duration, but cancel early if the abort signal fires.
 * Returns true if sleep completed normally, false if aborted.
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatWaitDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

// =============================================================================
// Helpers
// =============================================================================

function clampWaitMs(ms: number): number {
  return Math.max(MIN_WAIT_MS, Math.min(ms, MAX_RATE_LIMIT_WAIT_MS));
}
