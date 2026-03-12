/**
 * Auto-Swap Middleware
 * ====================
 *
 * AI SDK LanguageModel middleware that intercepts rate limit errors (429)
 * and automatically retries with the next available account from the
 * global priority queue.
 *
 * Applied via wrapLanguageModel() in createSimpleClient() and createAgentClient(),
 * giving auto-swap to ALL runners without per-runner changes.
 */

import { wrapLanguageModel } from 'ai';
import type { LanguageModelMiddleware, LanguageModel } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { resolveAuthFromQueue } from '../auth/resolver';
import { createProvider } from './factory';
import type { QueueResolvedAuth } from '../auth/types';
import type { ProviderAccount } from '../../../shared/types/provider-account';
import { isRateLimitError } from '../session/error-classifier';
import { extractWaitDuration, formatWaitDuration, sleepWithAbort } from '../session/rate-limit-wait';

/** Details emitted when the middleware swaps to a different account. */
export interface AutoSwapEvent {
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
}

interface AutoSwapContext {
  queueAuth: QueueResolvedAuth;
  queue: ProviderAccount[];
  requestedModel: string;
  /** Called after a successful swap so the UI can reflect the change. */
  onSwap?: (event: AutoSwapEvent) => void;
}

/**
 * Shared rate-limit recovery logic for wrapGenerate and wrapStream.
 *
 * On a 429 error:
 * 1. Try swapping to another account in the queue.
 * 2. If no swap target, wait for the session rate limit to reset (null = weekly limit, rethrow).
 * 3. Retry with `retry` (original model) or `retryOnNew` (new model, needs params).
 */
async function handleRateLimit<T>(
  error: unknown,
  ctx: AutoSwapContext,
  swappedRef: { value: boolean },
  retry: () => PromiseLike<T>,
  retryOnNew: (newModel: LanguageModelV3) => PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (swappedRef.value) {
    console.log('[AutoSwap] Already swapped once this call — not retrying again (prevents A→B→A loop)');
    throw error;
  }
  if (!isRateLimitError(error)) {
    console.log('[AutoSwap] Error is not a rate limit — passing through:', error instanceof Error ? error.message : String(error));
    throw error;
  }

  swappedRef.value = true;
  console.log('[AutoSwap] 🔴 Rate limit hit on account:', ctx.queueAuth.accountId, '| model:', ctx.requestedModel);
  console.log('[AutoSwap] Queue has', ctx.queue.length, 'accounts. Excluding current, looking for swap target...');

  const newAuth = await resolveAuthFromQueue(ctx.requestedModel, ctx.queue, {
    excludeAccountIds: [ctx.queueAuth.accountId],
  });

  if (!newAuth) {
    // No swap target — wait for session rate limit reset
    console.log('[AutoSwap] No swap target available — all other accounts excluded or unavailable');
    const waitInfo = extractWaitDuration(error);
    if (!waitInfo) {
      console.log('[AutoSwap] Cannot extract wait duration (weekly limit?) — giving up');
      throw error;
    }
    console.log('[AutoSwap] Waiting', formatWaitDuration(waitInfo.waitMs), 'for rate limit reset (type:', waitInfo.limitType + ')');
    await sleepWithAbort(waitInfo.waitMs, signal);
    console.log('[AutoSwap] Wait complete — retrying with original account');
    return retry();
  }

  // Notify the UI about the swap
  const fromAccount = ctx.queue.find((a) => a.id === ctx.queueAuth.accountId);
  const toAccount = ctx.queue.find((a) => a.id === newAuth.accountId);
  const fromName = fromAccount?.name ?? ctx.queueAuth.accountId;
  const toName = toAccount?.name ?? newAuth.accountId;
  console.log('[AutoSwap] ✅ SWAPPING:', fromName, '→', toName, '| provider:', newAuth.resolvedProvider, '| model:', newAuth.resolvedModelId);

  ctx.onSwap?.({
    fromAccountId: ctx.queueAuth.accountId,
    fromAccountName: fromName,
    toAccountId: newAuth.accountId,
    toAccountName: toName,
  });

  const newModel = createProvider({
    config: {
      provider: newAuth.resolvedProvider,
      apiKey: newAuth.apiKey,
      baseURL: newAuth.baseURL,
      headers: newAuth.headers,
      oauthTokenFilePath: newAuth.oauthTokenFilePath,
    },
    modelId: newAuth.resolvedModelId,
  }) as LanguageModelV3;

  console.log('[AutoSwap] New model created — retrying request on', toName);
  return retryOnNew(newModel);
}

function createAutoSwapMiddleware(ctx: AutoSwapContext): LanguageModelMiddleware {
  const swapped = { value: false }; // Only swap once per model instance

  return {
    specificationVersion: 'v3' as const,
    wrapGenerate: async ({ doGenerate, params }) => {
      // Reset per-call so each generateText() gets its own swap opportunity.
      // The flag only prevents infinite A→B→A loops within a single call.
      swapped.value = false;
      try {
        return await doGenerate();
      } catch (error) {
        console.log('[AutoSwap] wrapGenerate caught error — entering handleRateLimit');
        return handleRateLimit(error, ctx, swapped, doGenerate, (m) => m.doGenerate(params), params.abortSignal);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      swapped.value = false;
      try {
        return await doStream();
      } catch (error) {
        console.log('[AutoSwap] wrapStream caught error — entering handleRateLimit');
        return handleRateLimit(error, ctx, swapped, doStream, (m) => m.doStream(params), params.abortSignal);
      }
    },
  };
}

/**
 * Wrap a model with auto-swap middleware if queue context is available.
 * When a 429 error occurs, the middleware resolves the next available
 * account and retries with a new model — transparent to the caller.
 *
 * No-op if queue has fewer than 2 accounts (nothing to swap to).
 */
export function wrapWithAutoSwap(
  model: LanguageModel,
  queueAuth: QueueResolvedAuth | null,
  queue: ProviderAccount[],
  requestedModel: string,
  onSwap?: (event: AutoSwapEvent) => void,
): LanguageModel {
  if (!queueAuth || queue.length < 2) {
    console.log('[AutoSwap] Middleware NOT applied — queue has', queue.length, 'account(s) (need ≥2 for swap)');
    return model;
  }
  console.log('[AutoSwap] Middleware applied — account:', queueAuth.accountId, '| model:', requestedModel, '| queue size:', queue.length);
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: createAutoSwapMiddleware({ queueAuth, queue, requestedModel, onSwap }),
  });
}
