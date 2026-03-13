/**
 * AI Client Factory Tests
 *
 * Tests for creating configured AI clients.
 * Covers createAgentClient() and createSimpleClient() with various configurations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel } from 'ai';
import type { AgentClientConfig, SimpleClientConfig } from '../types';
import type { ToolContext } from '../../tools/types';
import type { ProviderAccount } from '../../../../shared/types/provider-account';

// Mock all dependencies
vi.mock('../../auth/resolver');
vi.mock('../../config/agent-configs');
vi.mock('../../config/phase-config');
vi.mock('../../mcp/client');
vi.mock('../../providers/factory');
vi.mock('../../tools/build-registry');

import { createAgentClient, createSimpleClient } from '../factory';
import { resolveAuth, resolveAuthFromQueue, buildDefaultQueueConfig } from '../../auth/resolver';
import { getDefaultThinkingLevel, getRequiredMcpServers } from '../../config/agent-configs';
import { resolveModelId } from '../../config/phase-config';
import { createMcpClientsForAgent, closeAllMcpClients, mergeMcpTools } from '../../mcp/client';
import { createProvider, detectProviderFromModel } from '../../providers/factory';
import { buildToolRegistry } from '../../tools/build-registry';

// ============================================
// Test Fixtures
// ============================================

const createMockToolContext = (): ToolContext => ({
  cwd: '/test/cwd',
  projectDir: '/test/project',
  specDir: '/test/spec',
  securityProfile: {
    baseCommands: new Set(),
    stackCommands: new Set(),
    scriptCommands: new Set(),
    customCommands: new Set(),
    customScripts: { shellScripts: [] },
    getAllAllowedCommands: () => new Set(),
  },
});

const createMockAgentClientConfig = (
  overrides?: Partial<AgentClientConfig>,
): AgentClientConfig => ({
  agentType: 'coder',
  systemPrompt: 'You are a coder agent.',
  toolContext: createMockToolContext(),
  phase: 'coding',
  ...overrides,
});

const createMockSimpleClientConfig = (
  overrides?: Partial<SimpleClientConfig>,
): SimpleClientConfig => ({
  systemPrompt: 'Generate a commit message.',
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

describe('AI Client Factory', () => {
  const mockModel = {} as LanguageModel;
  const mockTools = { read: {} as any, write: {} as any };
  const mockAuth = {
    apiKey: 'sk-test-key',
    source: 'environment' as const,
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock returns
    vi.mocked(resolveAuth).mockResolvedValue(mockAuth);
    vi.mocked(detectProviderFromModel).mockReturnValue('anthropic');
    vi.mocked(createProvider).mockReturnValue(mockModel);
    vi.mocked(getDefaultThinkingLevel).mockReturnValue('medium');
    vi.mocked(getRequiredMcpServers).mockReturnValue([]);

    // Mock tool registry
    const mockRegistry = {
      getToolsForAgent: vi.fn().mockReturnValue(mockTools),
    };
    vi.mocked(buildToolRegistry).mockReturnValue(mockRegistry as any);

    // Mock MCP functions
    vi.mocked(createMcpClientsForAgent).mockResolvedValue([]);
    vi.mocked(mergeMcpTools).mockReturnValue({});
    vi.mocked(closeAllMcpClients).mockResolvedValue(undefined);

    // Set default mock for resolveModelId to pass through by default
    vi.mocked(resolveModelId).mockImplementation((model) => model);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // createAgentClient
  // ============================================

  describe('createAgentClient', () => {
    it('should create an agent client with default config', async () => {
      const config = createMockAgentClientConfig();

      const result = await createAgentClient(config);

      expect(result).toBeDefined();
      expect(result.model).toBe(mockModel);
      expect(result.tools).toEqual(mockTools);
      expect(result.systemPrompt).toBe(config.systemPrompt);
      expect(result.maxSteps).toBe(200); // DEFAULT_MAX_STEPS
      expect(result.thinkingLevel).toBe('medium');
      expect(result.mcpClients).toEqual([]);
      expect(result.cleanup).toBeDefined();
    });

    it('should resolve auth using provider detection', async () => {
      // Mock resolveModelId to return a proper model ID for the phase
      vi.mocked(resolveModelId).mockImplementation((model) => {
        if (model === 'coding') return 'claude-opus-4-6';
        return model;
      });

      const config = createMockAgentClientConfig({
        profileId: 'test-profile',
      });

      await createAgentClient(config);

      expect(resolveModelId).toHaveBeenCalledWith('coding');
      expect(detectProviderFromModel).toHaveBeenCalledWith('claude-opus-4-6');
      expect(resolveAuth).toHaveBeenCalledWith({
        provider: 'anthropic',
        profileId: 'test-profile',
      });
    });

    it('should use custom maxSteps when provided', async () => {
      const config = createMockAgentClientConfig({
        maxSteps: 50,
      });

      const result = await createAgentClient(config);

      expect(result.maxSteps).toBe(50);
    });

    it('should use custom thinkingLevel when provided', async () => {
      const config = createMockAgentClientConfig({
        thinkingLevel: 'high',
      });

      const result = await createAgentClient(config);

      expect(result.thinkingLevel).toBe('high');
    });

    it('should use custom modelShorthand when provided', async () => {
      const config = createMockAgentClientConfig({
        modelShorthand: 'opus',
      });

      await createAgentClient(config);

      expect(resolveModelId).toHaveBeenCalledWith('opus');
    });

    it('should create MCP clients when required', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['mcp-server-1']);
      const mockMcpClient = {
        serverId: 'mcp-server-1',
        tools: {},
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(createMcpClientsForAgent).mockResolvedValue([mockMcpClient]);

      const config = createMockAgentClientConfig();

      const result = await createAgentClient(config);

      expect(createMcpClientsForAgent).toHaveBeenCalledWith('coder', {});
      expect(result.mcpClients).toEqual([mockMcpClient]);
    });

    it('should merge MCP tools into builtin tools', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['mcp-server-1']);
      const mockMcpTools = { mcpTool: {} as any };
      vi.mocked(mergeMcpTools).mockReturnValue(mockMcpTools);

      const config = createMockAgentClientConfig();

      const result = await createAgentClient(config);

      expect(mergeMcpTools).toHaveBeenCalled();
      expect(result.tools).toEqual(expect.objectContaining(mockMcpTools));
    });

    it('should include additional MCP servers when provided', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['builtin-server']);
      const config = createMockAgentClientConfig({
        additionalMcpServers: ['custom-server-1', 'custom-server-2'],
      });

      await createAgentClient(config);

      expect(getRequiredMcpServers).toHaveBeenCalledWith('coder', {});
      // Additional servers should be pushed to the list
    });

    it('should use queue-based resolution when queueConfig is provided', async () => {
      const queue = [createMockProviderAccount()];
      const mockQueueAuth = {
        apiKey: 'sk-queue-key',
        source: 'profile-api-key' as const,
        accountId: 'test-account-1',
        resolvedProvider: 'anthropic' as const,
        resolvedModelId: 'claude-opus-4-6',
        reasoningConfig: { type: 'none' as const },
      };
      vi.mocked(resolveAuthFromQueue).mockResolvedValue(mockQueueAuth);

      const config = createMockAgentClientConfig({
        queueConfig: {
          queue,
          requestedModel: 'claude-opus-4-6',
        },
      });

      const result = await createAgentClient(config);

      expect(resolveAuthFromQueue).toHaveBeenCalledWith('claude-opus-4-6', queue, expect.any(Object));
      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
        config: expect.objectContaining({
          provider: 'anthropic',
          apiKey: 'sk-queue-key',
        }),
        modelId: 'claude-opus-4-6',
      }));
      expect(result.queueAuth).toEqual(mockQueueAuth);
    });

    it('should throw error when queueConfig has no available accounts', async () => {
      vi.mocked(resolveAuthFromQueue).mockResolvedValue(null);

      const config = createMockAgentClientConfig({
        queueConfig: {
          queue: [],
          requestedModel: 'claude-opus-4-6',
        },
      });

      await expect(createAgentClient(config)).rejects.toThrow(
        'No available account in priority queue'
      );
    });

    it('should cleanup MCP clients when cleanup is called', async () => {
      const mockMcpClient = {
        serverId: 'mcp-server-1',
        tools: {},
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(createMcpClientsForAgent).mockResolvedValue([mockMcpClient]);
      vi.mocked(getRequiredMcpServers).mockReturnValue(['mcp-server-1']);

      const config = createMockAgentClientConfig();
      const result = await createAgentClient(config);

      // Verify MCP clients are in the result
      expect(result.mcpClients).toEqual([mockMcpClient]);

      await result.cleanup();

      expect(closeAllMcpClients).toHaveBeenCalledWith([mockMcpClient]);
    });
  });

  // ============================================
  // createSimpleClient
  // ============================================

  describe('createSimpleClient', () => {
    it('should create a simple client with defaults', async () => {
      // Mock the haiku model ID
      vi.mocked(resolveModelId).mockImplementation((model) => {
        if (model === 'haiku') return 'claude-haiku-4-5-20251001';
        return model;
      });

      const config = createMockSimpleClientConfig();

      const result = await createSimpleClient(config);

      expect(result).toBeDefined();
      expect(result.model).toBe(mockModel);
      expect(result.resolvedModelId).toBe('claude-haiku-4-5-20251001'); // default 'haiku'
      expect(result.systemPrompt).toBe(config.systemPrompt);
      expect(result.maxSteps).toBe(1); // DEFAULT_SIMPLE_MAX_STEPS
      expect(result.thinkingLevel).toBe('low'); // default thinking level
    });

    it('should use custom modelShorthand when provided', async () => {
      vi.mocked(resolveModelId).mockReturnValue('claude-sonnet-4-6');
      const config = createMockSimpleClientConfig({
        modelShorthand: 'sonnet',
      });

      const result = await createSimpleClient(config);

      expect(resolveModelId).toHaveBeenCalledWith('sonnet');
      expect(result.resolvedModelId).toBe('claude-sonnet-4-6');
    });

    it('should use custom thinkingLevel when provided', async () => {
      const config = createMockSimpleClientConfig({
        thinkingLevel: 'high',
      });

      const result = await createSimpleClient(config);

      expect(result.thinkingLevel).toBe('high');
    });

    it('should use custom maxSteps when provided', async () => {
      const config = createMockSimpleClientConfig({
        maxSteps: 5,
      });

      const result = await createSimpleClient(config);

      expect(result.maxSteps).toBe(5);
    });

    it('should include custom tools when provided', async () => {
      const customTools = { customTool: {} as any };
      const config = createMockSimpleClientConfig({
        tools: customTools,
      });

      const result = await createSimpleClient(config);

      expect(result.tools).toEqual(customTools);
    });

    it('should use profileId for auth resolution', async () => {
      const config = createMockSimpleClientConfig({
        profileId: 'test-profile',
      });

      await createSimpleClient(config);

      expect(resolveAuth).toHaveBeenCalledWith({
        provider: 'anthropic',
        profileId: 'test-profile',
      });
    });

    it('should use queue-based resolution when queueConfig is provided', async () => {
      const queue = [createMockProviderAccount()];
      const mockQueueAuth = {
        apiKey: 'sk-queue-key',
        source: 'profile-api-key' as const,
        accountId: 'test-account-1',
        resolvedProvider: 'anthropic' as const,
        resolvedModelId: 'claude-sonnet-4-6',
        reasoningConfig: { type: 'none' as const },
      };
      vi.mocked(resolveAuthFromQueue).mockResolvedValue(mockQueueAuth);

      const config = createMockSimpleClientConfig({
        queueConfig: {
          queue,
          requestedModel: 'claude-sonnet-4-6',
        },
      });

      const result = await createSimpleClient(config);

      expect(resolveAuthFromQueue).toHaveBeenCalled();
      expect(result.queueAuth).toEqual(mockQueueAuth);
      expect(result.resolvedModelId).toBe('claude-sonnet-4-6');
    });

    it('should throw error when queueConfig has no available accounts', async () => {
      vi.mocked(resolveAuthFromQueue).mockResolvedValue(null);

      const config = createMockSimpleClientConfig({
        queueConfig: {
          queue: [],
          requestedModel: 'claude-opus-4-6',
        },
      });

      await expect(createSimpleClient(config)).rejects.toThrow(
        'No available account in priority queue'
      );
    });

    it('should auto-build queue config from settings when not explicitly provided', async () => {
      const mockQueueConfig = {
        queue: [createMockProviderAccount()],
        requestedModel: 'claude-haiku-4-5-20251001',
      };
      vi.mocked(buildDefaultQueueConfig).mockReturnValue(mockQueueConfig);
      vi.mocked(resolveModelId).mockReturnValue('claude-haiku-4-5-20251001');
      // Mock successful queue resolution
      vi.mocked(resolveAuthFromQueue).mockResolvedValue({
        apiKey: 'sk-test-key',
        source: 'profile-api-key' as const,
        accountId: 'test-account-1',
        resolvedProvider: 'anthropic' as const,
        resolvedModelId: 'claude-haiku-4-5-20251001',
        reasoningConfig: { type: 'none' as const },
      });

      const config = createMockSimpleClientConfig();

      const result = await createSimpleClient(config);

      expect(buildDefaultQueueConfig).toHaveBeenCalledWith('claude-haiku-4-5-20251001');
      expect(result.queueAuth).toBeDefined();
    });

    it('should use explicit queueConfig when provided, skipping auto-build', async () => {
      const explicitQueueConfig = {
        queue: [createMockProviderAccount()],
        requestedModel: 'custom-model',
      };
      vi.mocked(buildDefaultQueueConfig).mockReturnValue(undefined); // Would return undefined if called
      // Mock successful queue resolution
      vi.mocked(resolveAuthFromQueue).mockResolvedValue({
        apiKey: 'sk-test-key',
        source: 'profile-api-key' as const,
        accountId: 'test-account-1',
        resolvedProvider: 'anthropic' as const,
        resolvedModelId: 'custom-model',
        reasoningConfig: { type: 'none' as const },
      });

      const config = createMockSimpleClientConfig({
        queueConfig: explicitQueueConfig,
      });

      const result = await createSimpleClient(config);

      // Should NOT call buildDefaultQueueConfig since explicit config was provided
      expect(buildDefaultQueueConfig).not.toHaveBeenCalled();
      expect(result.queueAuth).toBeDefined();
    });

    it('should handle full model IDs from other providers', async () => {
      const fullModelId = 'gpt-5.2-codex';
      vi.mocked(resolveModelId).mockReturnValue(fullModelId);
      vi.mocked(detectProviderFromModel).mockReturnValue('openai');

      const config = createMockSimpleClientConfig({
        modelShorthand: fullModelId,
      });

      const result = await createSimpleClient(config);

      expect(result.resolvedModelId).toBe(fullModelId);
      expect(detectProviderFromModel).toHaveBeenCalledWith(fullModelId);
    });
  });

  // ============================================
  // Default Constants
  // ============================================

  describe('default constants', () => {
    it('should use DEFAULT_MAX_STEPS for agent clients', async () => {
      const config = createMockAgentClientConfig();
      // Don't provide maxSteps

      const result = await createAgentClient(config);

      expect(result.maxSteps).toBe(200);
    });

    it('should use DEFAULT_SIMPLE_MAX_STEPS for simple clients', async () => {
      const config = createMockSimpleClientConfig();
      // Don't provide maxSteps

      const result = await createSimpleClient(config);

      expect(result.maxSteps).toBe(1);
    });

    it('should default to haiku for simple client model', async () => {
      const config = createMockSimpleClientConfig();
      // Don't provide modelShorthand

      await createSimpleClient(config);

      expect(resolveModelId).toHaveBeenCalledWith('haiku');
    });

    it('should default to low thinking for simple client', async () => {
      const config = createMockSimpleClientConfig();
      // Don't provide thinkingLevel

      const result = await createSimpleClient(config);

      expect(result.thinkingLevel).toBe('low');
    });
  });
});
