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
import { extractWaitDuration, sleepWithAbort } from '../session/rate-limit-wait';

interface AutoSwapContext {
  queueAuth: QueueResolvedAuth;
  queue: ProviderAccount[];
  requestedModel: string;
}

function createAutoSwapMiddleware(ctx: AutoSwapContext): LanguageModelMiddleware {
  let swapped = false; // Only swap once per model instance

  return {
    specificationVersion: 'v3' as const,
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (error) {
        if (swapped || !isRateLimitError(error)) throw error;
        swapped = true;

        const newAuth = await resolveAuthFromQueue(ctx.requestedModel, ctx.queue, {
          excludeAccountIds: [ctx.queueAuth.accountId],
        });
        if (!newAuth) {
          // No swap target — wait for session rate limit reset
          const waitInfo = extractWaitDuration(error);
          if (waitInfo) {
            await sleepWithAbort(waitInfo.waitMs);
            return doGenerate();
          }
          throw error;
        }

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

        return newModel.doGenerate(params);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (error) {
        if (swapped || !isRateLimitError(error)) throw error;
        swapped = true;

        const newAuth = await resolveAuthFromQueue(ctx.requestedModel, ctx.queue, {
          excludeAccountIds: [ctx.queueAuth.accountId],
        });
        if (!newAuth) {
          // No swap target — wait for session rate limit reset
          const waitInfo = extractWaitDuration(error);
          if (waitInfo) {
            await sleepWithAbort(waitInfo.waitMs);
            return doStream();
          }
          throw error;
        }

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

        return newModel.doStream(params);
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
): LanguageModel {
  if (!queueAuth || queue.length < 2) return model;
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: createAutoSwapMiddleware({ queueAuth, queue, requestedModel }),
  });
}
