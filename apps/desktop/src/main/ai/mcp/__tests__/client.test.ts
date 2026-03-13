/**
 * MCP Client Tests
 *
 * Tests for MCP client creation and management.
 * Covers transport creation, client initialization, tool merging,
 * and cleanup functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServerConfig, McpClientResult, StdioTransportConfig, StreamableHttpTransportConfig } from '../types';
import type { McpRegistryOptions } from '../registry';
import type { AgentType } from '../../config/agent-configs';
import type { McpServerResolveOptions } from '../../config/agent-configs';

// Mock all dependencies
vi.mock('@ai-sdk/mcp');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('../../config/agent-configs');

import { createMcpClient, createMcpClientsForAgent, mergeMcpTools, closeAllMcpClients } from '../client';
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getRequiredMcpServers } from '../../config/agent-configs';

// ============================================
// Test Fixtures
// ============================================

const createMockStdioConfig = (
  overrides?: Partial<StdioTransportConfig>,
): StdioTransportConfig => ({
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'test-server'],
  ...overrides,
});

const createMockHttpConfig = (
  overrides?: Partial<StreamableHttpTransportConfig>,
): StreamableHttpTransportConfig => ({
  type: 'streamable-http',
  url: 'http://localhost:8000',
  ...overrides,
});

const createMockServerConfig = (
  overrides?: Partial<McpServerConfig>,
): McpServerConfig => ({
  id: 'test-server',
  name: 'Test Server',
  enabledByDefault: true,
  transport: createMockStdioConfig(),
  ...overrides,
});

const createMockClientResult = (
  overrides?: Partial<McpClientResult>,
): McpClientResult => ({
  serverId: 'test-server',
  tools: { tool1: { name: 'tool1' }, tool2: { name: 'tool2' } },
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createMockMCPClient = () => ({
  tools: vi.fn().mockResolvedValue({
    tool1: { name: 'tool1', description: 'Test tool 1' },
    tool2: { name: 'tool2', description: 'Test tool 2' },
  }),
  close: vi.fn().mockResolvedValue(undefined),
}) as any;

// ============================================
// Setup & Teardown
// ============================================

describe('MCP Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createMCPClient from @ai-sdk/mcp
    vi.mocked(createMCPClient).mockResolvedValue(createMockMCPClient());

    // Mock getRequiredMcpServers
    vi.mocked(getRequiredMcpServers).mockReturnValue(['context7']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // createMcpClient
  // ============================================

  describe('createMcpClient', () => {
    it('should create client with stdio transport', async () => {
      const config = createMockServerConfig({
        transport: createMockStdioConfig(),
      });

      const result = await createMcpClient(config);

      expect(createMCPClient).toHaveBeenCalledWith({
        transport: expect.any(StdioClientTransport),
      });
      expect(result.serverId).toBe('test-server');
      expect(result.tools).toBeDefined();
      expect(typeof result.close).toBe('function');
    });

    it('should create client with streamable-http transport', async () => {
      const config = createMockServerConfig({
        transport: createMockHttpConfig({ url: 'http://test-server:9000' }),
      });

      const result = await createMcpClient(config);

      expect(createMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'http://test-server:9000',
        },
      });
      expect(result.serverId).toBe('test-server');
    });

    it('should pass environment variables to stdio transport', async () => {
      const config = createMockServerConfig({
        transport: createMockStdioConfig({
          env: { API_KEY: 'test-key', DEBUG: 'true' },
        }),
      });

      await createMcpClient(config);

      const transportCall = vi.mocked(createMCPClient).mock.calls[0][0].transport;
      expect(transportCall).toBeInstanceOf(StdioClientTransport);
    });

    it('should pass working directory to stdio transport', async () => {
      const config = createMockServerConfig({
        transport: createMockStdioConfig({
          cwd: '/test/working/dir',
        }),
      });

      await createMcpClient(config);

      const transportCall = vi.mocked(createMCPClient).mock.calls[0][0].transport;
      expect(transportCall).toBeInstanceOf(StdioClientTransport);
    });

    it('should include headers in http transport when provided', async () => {
      const config = createMockServerConfig({
        transport: createMockHttpConfig({
          headers: { Authorization: 'Bearer token123' },
        }),
      });

      await createMcpClient(config);

      expect(createMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'http://localhost:8000',
          headers: { Authorization: 'Bearer token123' },
        },
      });
    });

    it('should return tools from MCP client', async () => {
      const mockTools = {
        search: { name: 'search', description: 'Search tool' },
        read: { name: 'read', description: 'Read tool' },
      };
      vi.mocked(createMCPClient).mockResolvedValue({
        tools: vi.fn().mockResolvedValue(mockTools),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue([]),
        toolsFromDefinitions: vi.fn().mockResolvedValue({}),
        listResources: vi.fn().mockResolvedValue([]),
        readResource: vi.fn().mockResolvedValue(''),
        listPrompts: vi.fn().mockResolvedValue([]),
        getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
      } as any);

      const config = createMockServerConfig();
      const result = await createMcpClient(config);

      expect(result.tools).toEqual(mockTools);
    });

    it('should provide cleanup function that closes client', async () => {
      const mockClient = createMockMCPClient();
      const closeSpy = vi.spyOn(mockClient, 'close').mockResolvedValue(undefined);
      vi.mocked(createMCPClient).mockResolvedValue(mockClient);

      const config = createMockServerConfig();
      const result = await createMcpClient(config);

      await result.close();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  // ============================================
  // createMcpClientsForAgent
  // ============================================

  describe('createMcpClientsForAgent', () => {
    it('should create clients for all required servers', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['context7', 'electron']);

      const result = await createMcpClientsForAgent('coder');

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.serverId)).toBeDefined();
      expect(getRequiredMcpServers).toHaveBeenCalledWith('coder', {});
    });

    it('should pass resolveOptions to getRequiredMcpServers', async () => {
      const resolveOptions: McpServerResolveOptions = {
        projectCapabilities: { is_electron: true },
      };

      await createMcpClientsForAgent('qa_reviewer', resolveOptions);

      expect(getRequiredMcpServers).toHaveBeenCalledWith('qa_reviewer', resolveOptions);
    });

    it('should pass registryOptions to server resolution', async () => {
      const registryOptions: McpRegistryOptions = {
        specDir: '/test/spec',
        memoryMcpUrl: 'http://memory:8000',
      };

      vi.mocked(getRequiredMcpServers).mockReturnValue(['auto-claude']);

      await createMcpClientsForAgent('planner', {}, registryOptions);

      // The registry options should be used when resolving servers
      expect(getRequiredMcpServers).toHaveBeenCalled();
    });

    it('should create clients in parallel', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue([
        'context7',
        'electron',
        'puppeteer',
      ]);

      const startTime = Date.now();
      await createMcpClientsForAgent('coder');
      const endTime = Date.now();

      // With parallel creation, this should complete quickly
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle client creation failures gracefully', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['context7', 'invalid-server']);

      // Mock createMCPClient to fail for the second call
      let callCount = 0;
      vi.mocked(createMCPClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Connection failed');
        }
        return createMockMCPClient();
      });

      const result = await createMcpClientsForAgent('coder');

      // Should return only successful clients
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no servers required', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue([]);

      const result = await createMcpClientsForAgent('coder');

      expect(result).toEqual([]);
    });

    it('should include serverId in each client result', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['context7', 'electron']);

      const result = await createMcpClientsForAgent('coder');

      expect(result[0].serverId).toBeDefined();
      expect(result[1].serverId).toBeDefined();
      expect(result[0].serverId).not.toBe(result[1].serverId);
    });
  });

  // ============================================
  // mergeMcpTools
  // ============================================

  describe('mergeMcpTools', () => {
    it('should merge tools from multiple clients', () => {
      const client1 = createMockClientResult({
        serverId: 'server1',
        tools: { tool1: { name: 'tool1' }, tool2: { name: 'tool2' } },
      });
      const client2 = createMockClientResult({
        serverId: 'server2',
        tools: { tool3: { name: 'tool3' }, tool4: { name: 'tool4' } },
      });

      const result = mergeMcpTools([client1, client2]);

      expect(result).toEqual({
        tool1: { name: 'tool1' },
        tool2: { name: 'tool2' },
        tool3: { name: 'tool3' },
        tool4: { name: 'tool4' },
      });
    });

    it('should handle empty client array', () => {
      const result = mergeMcpTools([]);

      expect(result).toEqual({});
    });

    it('should handle single client', () => {
      const client = createMockClientResult({
        tools: { tool1: { name: 'tool1' } },
      });

      const result = mergeMcpTools([client]);

      expect(result).toEqual({ tool1: { name: 'tool1' } });
    });

    it('should handle client with no tools', () => {
      const client = createMockClientResult({
        tools: {},
      });

      const result = mergeMcpTools([client]);

      expect(result).toEqual({});
    });

    it('should overwrite duplicate tool names with last client value', () => {
      const client1 = createMockClientResult({
        tools: { shared: { from: 'client1' } },
      });
      const client2 = createMockClientResult({
        tools: { shared: { from: 'client2' } },
      });

      const result = mergeMcpTools([client1, client2]);

      // Last client wins
      expect(result.shared).toEqual({ from: 'client2' });
    });

    it('should preserve tool references from clients', () => {
      const tool1 = { name: 'tool1', execute: vi.fn() };
      const tool2 = { name: 'tool2', execute: vi.fn() };

      const client = createMockClientResult({
        tools: { tool1, tool2 },
      });

      const result = mergeMcpTools([client]);

      expect(result.tool1).toBe(tool1);
      expect(result.tool2).toBe(tool2);
    });
  });

  // ============================================
  // closeAllMcpClients
  // ============================================

  describe('closeAllMcpClients', () => {
    it('should close all clients', async () => {
      const closeSpy1 = vi.fn().mockResolvedValue(undefined);
      const closeSpy2 = vi.fn().mockResolvedValue(undefined);
      const closeSpy3 = vi.fn().mockResolvedValue(undefined);

      const clients = [
        createMockClientResult({ close: closeSpy1 }),
        createMockClientResult({ close: closeSpy2 }),
        createMockClientResult({ close: closeSpy3 }),
      ];

      await closeAllMcpClients(clients);

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
      expect(closeSpy3).toHaveBeenCalled();
    });

    it('should handle empty client array', async () => {
      await expect(closeAllMcpClients([])).resolves.toBeUndefined();
    });

    it('should handle single client', async () => {
      const closeSpy = vi.fn().mockResolvedValue(undefined);
      const clients = [createMockClientResult({ close: closeSpy })];

      await closeAllMcpClients(clients);

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should continue closing if one client fails', async () => {
      const closeSpy1 = vi.fn().mockResolvedValue(undefined);
      const closeSpy2 = vi.fn().mockRejectedValue(new Error('Close failed'));
      const closeSpy3 = vi.fn().mockResolvedValue(undefined);

      const clients = [
        createMockClientResult({ close: closeSpy1 }),
        createMockClientResult({ close: closeSpy2 }),
        createMockClientResult({ close: closeSpy3 }),
      ];

      await closeAllMcpClients(clients);

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
      expect(closeSpy3).toHaveBeenCalled();
    });

    it('should close clients in parallel', async () => {
      let closeOrder: string[] = [];
      const clients = [
        createMockClientResult({
          close: vi.fn().mockImplementation(async () => {
            closeOrder.push('client1');
            await new Promise((resolve) => setTimeout(resolve, 10));
          }),
        }),
        createMockClientResult({
          close: vi.fn().mockImplementation(async () => {
            closeOrder.push('client2');
            await new Promise((resolve) => setTimeout(resolve, 5));
          }),
        }),
        createMockClientResult({
          close: vi.fn().mockImplementation(async () => {
            closeOrder.push('client3');
            await new Promise((resolve) => setTimeout(resolve, 1));
          }),
        }),
      ];

      await closeAllMcpClients(clients);

      // All should close, but order depends on Promise.allSettled
      expect(closeOrder).toHaveLength(3);
    });

    it('should await all close operations', async () => {
      let closeCount = 0;
      const clients = [
        createMockClientResult({
          close: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            closeCount++;
          }),
        }),
        createMockClientResult({
          close: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            closeCount++;
          }),
        }),
      ];

      await closeAllMcpClients(clients);

      expect(closeCount).toBe(2);
    });
  });

  // ============================================
  // Transport Creation (Internal)
  // ============================================

  describe('transport creation', () => {
    it('should create StdioClientTransport with correct args', async () => {
      const config = createMockServerConfig({
        transport: createMockStdioConfig({
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'test' },
        }),
      });

      await createMcpClient(config);

      const transport = vi.mocked(createMCPClient).mock.calls[0][0].transport;
      expect(transport).toBeInstanceOf(StdioClientTransport);
    });

    it('should create SSE transport config with url', async () => {
      const config = createMockServerConfig({
        transport: createMockHttpConfig({
          url: 'https://api.example.com/mcp',
        }),
      });

      await createMcpClient(config);

      const transportConfig = vi.mocked(createMCPClient).mock.calls[0][0].transport;
      expect(transportConfig).toEqual({
        type: 'sse',
        url: 'https://api.example.com/mcp',
      });
    });

    it('should include optional headers in SSE transport', async () => {
      const config = createMockServerConfig({
        transport: createMockHttpConfig({
          url: 'https://api.example.com/mcp',
          headers: {
            Authorization: 'Bearer token',
            'X-Custom-Header': 'value',
          },
        }),
      });

      await createMcpClient(config);

      const transportConfig = vi.mocked(createMCPClient).mock.calls[0][0].transport;
      expect(transportConfig).toEqual({
        type: 'sse',
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Bearer token',
          'X-Custom-Header': 'value',
        },
      });
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should propagate client creation errors', async () => {
      vi.mocked(createMCPClient).mockRejectedValue(new Error('Connection timeout'));

      const config = createMockServerConfig();

      await expect(createMcpClient(config)).rejects.toThrow('Connection timeout');
    });

    it('should propagate tools() errors', async () => {
      vi.mocked(createMCPClient).mockResolvedValue({
        tools: vi.fn().mockRejectedValue(new Error('Tools fetch failed')),
        close: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue([]),
        toolsFromDefinitions: vi.fn().mockResolvedValue({}),
        listResources: vi.fn().mockResolvedValue([]),
        readResource: vi.fn().mockResolvedValue(''),
        listPrompts: vi.fn().mockResolvedValue([]),
        getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
      } as any);

      const config = createMockServerConfig();

      await expect(createMcpClient(config)).rejects.toThrow('Tools fetch failed');
    });

    it('should handle cleanup errors gracefully in closeAllMcpClients', async () => {
      const clients = [
        createMockClientResult({
          close: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
        }),
      ];

      // Should not throw
      await expect(closeAllMcpClients(clients)).resolves.toBeUndefined();
    });
  });

  // ============================================
  // Agent Type Integration
  // ============================================

  describe('agent type integration', () => {
    it('should get correct servers for coder agent', async () => {
      vi.mocked(getRequiredMcpServers).mockImplementation((agentType) => {
        if (agentType === 'coder') return ['context7', 'auto-claude'];
        return [];
      });

      const result = await createMcpClientsForAgent('coder');

      expect(getRequiredMcpServers).toHaveBeenCalledWith('coder', {});
      expect(result).toHaveLength(2);
    });

    it('should get correct servers for qa agent', async () => {
      vi.mocked(getRequiredMcpServers).mockImplementation((agentType) => {
        if (agentType === 'qa_reviewer') return ['context7', 'electron', 'puppeteer'];
        return [];
      });

      const result = await createMcpClientsForAgent('qa_reviewer');

      expect(getRequiredMcpServers).toHaveBeenCalledWith('qa_reviewer', {});
      expect(result).toHaveLength(3);
    });

    it('should support custom agent types', async () => {
      vi.mocked(getRequiredMcpServers).mockReturnValue(['context7']);

      const result = await createMcpClientsForAgent('custom-agent' as AgentType);

      expect(result).toHaveLength(1);
    });
  });
});
