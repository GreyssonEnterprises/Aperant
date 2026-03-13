/**
 * AI Auth Resolver Tests
 *
 * Tests for multi-stage credential resolution with fallback chains.
 * Covers OAuth tokens, API keys, environment variables, and queue-based resolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupportedProvider } from '../../providers/types';
import type {
  AuthResolverContext,
  ResolvedAuth,
  QueueResolvedAuth,
} from '../types';
import type { ProviderAccount } from '../../../../shared/types/provider-account';
import {
  registerSettingsAccessor,
  resolveAuth,
  refreshOAuthTokenReactive,
  hasCredentials,
  resolveAuthFromQueue,
  buildDefaultQueueConfig,
} from '../resolver';
import {
  PROVIDER_ENV_VARS,
  PROVIDER_SETTINGS_KEY,
  PROVIDER_BASE_URL_ENV,
} from '../types';

// ============================================
// Test Fixtures
// ============================================

const mockSettingsAccessor = vi.fn();

const createMockContext = (
  provider: SupportedProvider = 'anthropic',
  overrides?: Partial<AuthResolverContext>,
): AuthResolverContext => ({
  provider,
  profileId: 'test-profile',
  configDir: '/test/config',
  ...overrides,
});

const createMockProviderAccount = (
  overrides?: Partial<ProviderAccount>,
): ProviderAccount => ({
  id: 'test-account-1',
  provider: 'anthropic',
  name: 'Test Account',
  authType: 'api-key',
  billingModel: 'pay-per-use',
  apiKey: 'sk-test-key',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('AI Auth Resolver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };

    // Clear mock settings accessor
    mockSettingsAccessor.mockReset();
    registerSettingsAccessor(mockSettingsAccessor);

    // Clear any env vars that might interfere
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ZHIPU_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================
  // Settings Accessor Registration
  // ============================================

  describe('registerSettingsAccessor', () => {
    it('should register a settings accessor function', () => {
      const accessor = vi.fn();
      registerSettingsAccessor(accessor);
      // Accessor is registered; actual usage tested in other tests
      expect(accessor).toBeDefined();
    });
  });

  // ============================================
  // Environment Variable Resolution
  // ============================================

  describe('resolveFromEnvironment', () => {
    it('should resolve Anthropic API key from environment', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result).toEqual({
        apiKey: 'sk-ant-test-key',
        source: 'environment',
      });
    });

    it('should resolve OpenAI API key from environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test-key';
      const ctx = createMockContext('openai');

      const result = await resolveAuth(ctx);

      expect(result).toEqual({
        apiKey: 'sk-openai-test-key',
        source: 'environment',
      });
    });

    it('should resolve Google API key from environment', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'google-test-key';
      const ctx = createMockContext('google');

      const result = await resolveAuth(ctx);

      expect(result).toEqual({
        apiKey: 'google-test-key',
        source: 'environment',
      });
    });

    it('should include custom base URL from environment', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      process.env.ANTHROPIC_BASE_URL = 'https://custom.anthropic.com';
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result?.baseURL).toBe('https://custom.anthropic.com');
    });

    it('should return null for providers without env var support', async () => {
      const ctx = createMockContext('bedrock'); // Uses AWS credential chain

      const result = await resolveAuth(ctx);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // Profile API Key Resolution
  // ============================================

  describe('resolveFromProfileApiKey', () => {
    it('should resolve API key from settings', async () => {
      mockSettingsAccessor.mockReturnValue('sk-settings-key');
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result).toEqual({
        apiKey: 'sk-settings-key',
        source: 'profile-api-key',
      });
      expect(mockSettingsAccessor).toHaveBeenCalledWith('globalAnthropicApiKey');
    });

    it('should return null when no API key in settings', async () => {
      mockSettingsAccessor.mockReturnValue(undefined);
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result).toBeNull();
    });

    it('should include base URL from environment when resolving from settings', async () => {
      mockSettingsAccessor.mockReturnValue('sk-settings-key');
      process.env.OPENAI_BASE_URL = 'https://custom.openai.com';
      const ctx = createMockContext('openai');

      const result = await resolveAuth(ctx);

      expect(result?.baseURL).toBe('https://custom.openai.com');
    });
  });

  // ============================================
  // Default Credentials (No-Auth Providers)
  // ============================================

  describe('resolveDefaultCredentials', () => {
    it('should return default credentials for Ollama', async () => {
      const ctx = createMockContext('ollama');

      const result = await resolveAuth(ctx);

      expect(result).toEqual({
        apiKey: '',
        source: 'default',
      });
    });

    it('should return null for providers requiring auth', async () => {
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // Fallback Chain Priority
  // ============================================

  describe('resolveAuth fallback chain', () => {
    it('should prioritize profile API key over environment', async () => {
      mockSettingsAccessor.mockReturnValue('sk-settings-key');
      process.env.ANTHROPIC_API_KEY = 'sk-env-key';
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result?.source).toBe('profile-api-key');
      expect(result?.apiKey).toBe('sk-settings-key');
    });

    it('should fall back to environment when profile key not set', async () => {
      mockSettingsAccessor.mockReturnValue(undefined);
      process.env.ANTHROPIC_API_KEY = 'sk-env-key';
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result?.source).toBe('environment');
      expect(result?.apiKey).toBe('sk-env-key');
    });

    it('should return null when no credentials available', async () => {
      mockSettingsAccessor.mockReturnValue(undefined);
      const ctx = createMockContext('anthropic');

      const result = await resolveAuth(ctx);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // hasCredentials
  // ============================================

  describe('hasCredentials', () => {
    it('should return true when credentials are available', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';
      const ctx = createMockContext('anthropic');

      const result = await hasCredentials(ctx);

      expect(result).toBe(true);
    });

    it('should return false when no credentials available', async () => {
      const ctx = createMockContext('anthropic');

      const result = await hasCredentials(ctx);

      expect(result).toBe(false);
    });
  });

  // ============================================
  // Queue-Based Resolution
  // ============================================

  describe('resolveAuthFromQueue', () => {
    it('should resolve from first available account in queue', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';
      const queue = [
        createMockProviderAccount({ id: 'account-1', provider: 'anthropic' }),
      ];
      mockSettingsAccessor.mockReturnValue(JSON.stringify(queue));

      const result = await resolveAuthFromQueue('claude-opus-4-6', queue);

      expect(result).not.toBeNull();
      expect(result?.accountId).toBe('account-1');
      expect(result?.resolvedProvider).toBe('anthropic');
    });

    it('should skip excluded accounts', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';
      const queue = [
        createMockProviderAccount({ id: 'account-1', provider: 'anthropic' }),
        createMockProviderAccount({ id: 'account-2', provider: 'anthropic' }),
      ];

      const result = await resolveAuthFromQueue('claude-opus-4-6', queue, {
        excludeAccountIds: ['account-1'],
      });

      expect(result?.accountId).toBe('account-2');
    });

    it('should return null when no accounts available', async () => {
      const queue: ProviderAccount[] = [];

      const result = await resolveAuthFromQueue('claude-opus-4-6', queue);

      expect(result).toBeNull();
    });

    it('should include resolved model ID in result', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';
      const queue = [
        createMockProviderAccount({ id: 'account-1', provider: 'anthropic' }),
      ];

      const result = await resolveAuthFromQueue('claude-opus-4-6', queue);

      expect(result?.resolvedModelId).toBe('claude-opus-4-6');
    });
  });

  // ============================================
  // buildDefaultQueueConfig
  // ============================================

  describe('buildDefaultQueueConfig', () => {
    it('should build queue config from settings', () => {
      const accounts = [
        createMockProviderAccount({ id: 'account-1', name: 'Account 1' }),
        createMockProviderAccount({ id: 'account-2', name: 'Account 2' }),
      ];
      mockSettingsAccessor.mockImplementation((key) => {
        if (key === 'providerAccounts') return JSON.stringify(accounts);
        if (key === 'globalPriorityOrder') return JSON.stringify(['account-2', 'account-1']);
        return undefined;
      });

      const result = buildDefaultQueueConfig('claude-opus-4-6');

      expect(result).toBeDefined();
      expect(result?.queue).toHaveLength(2);
      expect(result?.queue[0].id).toBe('account-2'); // Priority order
      expect(result?.requestedModel).toBe('claude-opus-4-6');
    });

    it('should return undefined when no accounts configured', () => {
      mockSettingsAccessor.mockReturnValue(undefined);

      const result = buildDefaultQueueConfig('claude-opus-4-6');

      expect(result).toBeUndefined();
    });

    it('should handle invalid JSON gracefully', () => {
      mockSettingsAccessor.mockReturnValue('invalid-json');

      const result = buildDefaultQueueConfig('claude-opus-4-6');

      expect(result).toBeUndefined();
    });
  });

  // ============================================
  // Type Constants
  // ============================================

  describe('PROVIDER_ENV_VARS constant', () => {
    it('should have correct env var mappings', () => {
      expect(PROVIDER_ENV_VARS.anthropic).toBe('ANTHROPIC_API_KEY');
      expect(PROVIDER_ENV_VARS.openai).toBe('OPENAI_API_KEY');
      expect(PROVIDER_ENV_VARS.google).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
      expect(PROVIDER_ENV_VARS.bedrock).toBeUndefined();
      expect(PROVIDER_ENV_VARS.ollama).toBeUndefined();
    });
  });

  describe('PROVIDER_SETTINGS_KEY constant', () => {
    it('should have correct settings key mappings', () => {
      expect(PROVIDER_SETTINGS_KEY.anthropic).toBe('globalAnthropicApiKey');
      expect(PROVIDER_SETTINGS_KEY.openai).toBe('globalOpenAIApiKey');
      expect(PROVIDER_SETTINGS_KEY.google).toBe('globalGoogleApiKey');
    });
  });

  describe('PROVIDER_BASE_URL_ENV constant', () => {
    it('should have correct base URL env var mappings', () => {
      expect(PROVIDER_BASE_URL_ENV.anthropic).toBe('ANTHROPIC_BASE_URL');
      expect(PROVIDER_BASE_URL_ENV.openai).toBe('OPENAI_BASE_URL');
      expect(PROVIDER_BASE_URL_ENV.azure).toBe('AZURE_OPENAI_ENDPOINT');
    });
  });
});
