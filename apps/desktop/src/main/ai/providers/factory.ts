/**
 * Provider Factory
 *
 * Creates Vercel AI SDK provider instances from configuration.
 * Maps provider names to the correct @ai-sdk/* constructor and handles
 * per-provider options (thinking tokens, strict JSON, Azure deployments).
 *
 * See apps/desktop/src/main/ai/providers/factory.ts for the TypeScript implementation.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';

import { MODEL_PROVIDER_MAP } from '../config/types';
import { createOAuthProviderFetch } from './oauth-fetch';
import { type ProviderConfig, SupportedProvider } from './types';

// =============================================================================
// OAuth Token Detection
// =============================================================================

/**
 * Detects if a credential is an Anthropic OAuth token vs an API key.
 * OAuth access tokens start with 'sk-ant-oa' prefix.
 * API keys start with 'sk-ant-api' prefix.
 */
function isOAuthToken(token: string | undefined): boolean {
  if (!token) return false;
  return token.startsWith('sk-ant-oa') || token.startsWith('sk-ant-ort');
}

// =============================================================================
// Anthropic OAuth System Prompt Injection
// =============================================================================

/**
 * The Claude Code identity string that Anthropic's API requires as the first
 * system block for OAuth tokens to access Opus/Sonnet models.
 * Must be a SEPARATE system block (not combined with other text).
 */
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Creates a fetch interceptor that injects the Claude Code identity as a
 * separate first system block in Anthropic API requests.
 *
 * Anthropic's API validates that OAuth tokens include this identity as an
 * exact-match first system block to access Opus/Sonnet models.
 * The identity must be a separate `{type: "text", text: "..."}` entry —
 * combining it with other text in a single block is rejected.
 */
function createOAuthSystemPromptFetch(): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method?.toUpperCase() === 'POST' && init.body) {
      try {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as ArrayBuffer));

        if (body.system && Array.isArray(body.system)) {
          // Check if identity block already present
          const hasIdentity = body.system.length > 0
            && body.system[0]?.type === 'text'
            && body.system[0]?.text === CLAUDE_CODE_IDENTITY;

          if (!hasIdentity) {
            body.system = [
              { type: 'text', text: CLAUDE_CODE_IDENTITY },
              ...body.system,
            ];
            init = { ...init, body: JSON.stringify(body) };
          }
        } else if (body.system === undefined && body.messages) {
          // No system prompt at all — add identity block
          body.system = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }];
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        // JSON parse failed — pass through unchanged
      }
    }

    return globalThis.fetch(input, init);
  };
}

// =============================================================================
// Provider Instance Creators
// =============================================================================

/**
 * Creates a provider SDK instance (not a model) for the given config.
 * Each provider has its own constructor with different auth options.
 */
function createProviderInstance(config: ProviderConfig) {
  const { provider, apiKey, baseURL, headers } = config;

  switch (provider) {
    case SupportedProvider.Anthropic: {
      // OAuth tokens use authToken (Authorization: Bearer) + required beta header
      // API keys use apiKey (x-api-key header)
      // Custom fetch injects Claude Code identity system block for model access
      if (isOAuthToken(apiKey)) {
        return createAnthropic({
          authToken: apiKey,
          baseURL,
          headers: {
            ...headers,
            'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14',
          },
          fetch: createOAuthSystemPromptFetch(),
        });
      }
      return createAnthropic({
        apiKey,
        baseURL,
        headers,
      });
    }

    case SupportedProvider.OpenAI: {
      // File-based OAuth: use generic fetch interceptor for token injection + URL rewriting
      if (config.oauthTokenFilePath) {
        return createOpenAI({
          apiKey: apiKey ?? 'codex-oauth-placeholder',
          baseURL,
          headers,
          fetch: createOAuthProviderFetch(config.oauthTokenFilePath, 'openai'),
        });
      }
      return createOpenAI({
        apiKey,
        baseURL,
        headers,
      });
    }

    case SupportedProvider.Google:
      return createGoogleGenerativeAI({
        apiKey,
        baseURL,
        headers,
      });

    case SupportedProvider.Bedrock:
      return createAmazonBedrock({
        region: config.region ?? 'us-east-1',
        apiKey,
      });

    case SupportedProvider.Azure:
      return createAzure({
        apiKey,
        baseURL,
        headers,
      });

    case SupportedProvider.Mistral:
      return createMistral({
        apiKey,
        baseURL,
        headers,
      });

    case SupportedProvider.Groq:
      return createGroq({
        apiKey,
        baseURL,
        headers,
      });

    case SupportedProvider.XAI:
      return createXai({
        apiKey,
        baseURL,
        headers,
      });

    case SupportedProvider.OpenRouter:
      return createOpenRouter({
        apiKey,
      });

    case SupportedProvider.ZAI:
      return createOpenAICompatible({
        name: 'zai',
        apiKey,
        baseURL: baseURL ?? 'https://api.z.ai/api/paas/v4',
        headers,
      });

    case SupportedProvider.Ollama: {
      // Account settings store the base Ollama URL (e.g., 'http://localhost:11434')
      // but the OpenAI-compatible SDK needs the /v1 path appended.
      let ollamaBaseURL = baseURL ?? 'http://localhost:11434';
      if (!ollamaBaseURL.endsWith('/v1')) {
        ollamaBaseURL = ollamaBaseURL.replace(/\/+$/, '') + '/v1';
      }
      return createOpenAICompatible({
        name: 'ollama',
        apiKey: apiKey ?? 'ollama',
        baseURL: ollamaBaseURL,
        headers,
      });
    }

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}

// =============================================================================
// Codex Model Detection
// =============================================================================

/**
 * Detects if a model ID refers to an OpenAI Codex model.
 * Codex models only support the Responses API (not Chat Completions).
 */
function isCodexModel(modelId: string): boolean {
  return modelId.includes('codex');
}

// =============================================================================
// Model Creation Options
// =============================================================================

/** Options for creating a language model */
export interface CreateProviderOptions {
  /** Provider configuration */
  config: ProviderConfig;
  /** Full model ID (e.g., 'claude-sonnet-4-5-20250929') */
  modelId: string;
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Creates a LanguageModel instance for the given provider + model combination.
 *
 * Handles per-provider quirks:
 * - Azure uses deployment-based routing via `.chat()`
 * - Ollama uses OpenAI-compatible adapter
 *
 * @param options - Provider config and model ID
 * @returns A configured LanguageModel instance
 */
export function createProvider(options: CreateProviderOptions): LanguageModel {
  const { config, modelId } = options;
  const instance = createProviderInstance(config);

  // Azure uses deployment names, not model IDs
  if (config.provider === SupportedProvider.Azure) {
    const deploymentName = config.deploymentName ?? modelId;
    return (instance as ReturnType<typeof createAzure>).chat(deploymentName);
  }

  // OpenAI: Codex OAuth accounts rewrite ALL URLs to the Codex Responses endpoint,
  // so every model must use `.responses()` to avoid a format mismatch (Chat Completions
  // format sent to Responses endpoint → 400). Regular API-key accounts use
  // `.responses()` for Codex models and `.chat()` for everything else.
  if (config.provider === SupportedProvider.OpenAI) {
    if (config.oauthTokenFilePath || isCodexModel(modelId)) {
      return (instance as ReturnType<typeof createOpenAI>).responses(modelId);
    }
    return (instance as ReturnType<typeof createOpenAI>).chat(modelId);
  }

  // Generic path: call provider instance as function with model ID
  return (instance as ReturnType<typeof createAnthropic>)(modelId);
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detects the provider for a model ID based on its prefix.
 * Uses MODEL_PROVIDER_MAP for prefix-based matching.
 *
 * @param modelId - Full model ID (e.g., 'claude-sonnet-4-5-20250929', 'gpt-4o')
 * @returns The detected provider, or undefined if no match
 */
export function detectProviderFromModel(modelId: string): SupportedProvider | undefined {
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (modelId.startsWith(prefix)) {
      return provider;
    }
  }
  return undefined;
}

/**
 * Creates a LanguageModel from a model ID, auto-detecting the provider.
 * Useful when only a model ID is known (e.g., from user settings).
 *
 * @param modelId - Full model ID
 * @param overrides - Optional provider config overrides (apiKey, baseURL, etc.)
 * @returns A configured LanguageModel instance
 * @throws If the provider cannot be detected from the model ID
 */
export function createProviderFromModelId(
  modelId: string,
  overrides?: Partial<Omit<ProviderConfig, 'provider'>>,
): LanguageModel {
  const provider = detectProviderFromModel(modelId);
  if (!provider) {
    throw new Error(
      `Cannot detect provider for model "${modelId}". ` +
        `Known prefixes: ${Object.keys(MODEL_PROVIDER_MAP).join(', ')}`,
    );
  }

  return createProvider({
    config: {
      provider,
      ...overrides,
    },
    modelId,
  });
}
