/**
 * MCP Registry Tests
 *
 * Tests for MCP server configuration registry.
 * Covers server config resolution, environment-based configuration,
 * and conditional server enabling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getMcpServerConfig,
  resolveMcpServers,
  type McpRegistryOptions,
} from '../registry';

// ============================================
// Test Fixtures
// ============================================

const createDefaultOptions = (
  overrides?: Partial<McpRegistryOptions>,
): McpRegistryOptions => ({
  specDir: '/test/spec',
  memoryMcpUrl: 'http://localhost:8000',
  linearApiKey: 'linear-test-key',
  env: {
    LINEAR_API_KEY: 'env-linear-key',
    GRAPHITI_MCP_URL: 'http://env-memory:8000',
  },
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('MCP Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // getMcpServerConfig - Known Servers
  // ============================================

  describe('getMcpServerConfig - known servers', () => {
    it('should return context7 server config', () => {
      const result = getMcpServerConfig('context7');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('context7');
      expect(result?.name).toBe('Context7');
      expect(result?.enabledByDefault).toBe(true);
      expect(result?.transport.type).toBe('stdio');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.command).toBe('npx');
      }
    });

    it('should return electron server config', () => {
      const result = getMcpServerConfig('electron');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('electron');
      expect(result?.name).toBe('Electron');
      expect(result?.enabledByDefault).toBe(false);
      expect(result?.transport.type).toBe('stdio');
    });

    it('should return puppeteer server config', () => {
      const result = getMcpServerConfig('puppeteer');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('puppeteer');
      expect(result?.name).toBe('Puppeteer');
      expect(result?.enabledByDefault).toBe(false);
      expect(result?.transport.type).toBe('stdio');
    });

    it('should return auto-claude server config with specDir from options', () => {
      const options = createDefaultOptions({ specDir: '/custom/spec' });
      const result = getMcpServerConfig('auto-claude', options);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('auto-claude');
      expect(result?.name).toBe('Auto-Claude');
      expect(result?.enabledByDefault).toBe(true);
      expect(result?.transport.type).toBe('stdio');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.env?.SPEC_DIR).toBe('/custom/spec');
      }
    });

    it('should return auto-claude server with empty specDir when not provided', () => {
      const result = getMcpServerConfig('auto-claude', {});

      expect(result).not.toBeNull();
      if (result?.transport.type === 'stdio') {
        expect(result.transport.env?.SPEC_DIR).toBe('');
      }
    });
  });

  // ============================================
  // getMcpServerConfig - Conditional Servers
  // ============================================

  describe('getMcpServerConfig - conditional servers', () => {
    it('should return null for linear server when no API key available', () => {
      const result = getMcpServerConfig('linear', {});

      expect(result).toBeNull();
    });

    it('should return linear server config with API key from options', () => {
      const options = createDefaultOptions({ linearApiKey: 'linear-api-key-123' });
      const result = getMcpServerConfig('linear', options);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('linear');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.env?.LINEAR_API_KEY).toBe('linear-api-key-123');
      }
    });

    it('should return linear server config with API key from env', () => {
      const options = createDefaultOptions({
        linearApiKey: undefined,
        env: { LINEAR_API_KEY: 'env-linear-key' },
      });
      const result = getMcpServerConfig('linear', options);

      expect(result).not.toBeNull();
      if (result?.transport.type === 'stdio') {
        expect(result.transport.env?.LINEAR_API_KEY).toBe('env-linear-key');
      }
    });

    it('should prefer options.linearApiKey over env.LINEAR_API_KEY', () => {
      const options = createDefaultOptions({
        linearApiKey: 'options-key',
        env: { LINEAR_API_KEY: 'env-key' },
      });
      const result = getMcpServerConfig('linear', options);

      expect(result).not.toBeNull();
      if (result?.transport.type === 'stdio') {
        expect(result.transport.env?.LINEAR_API_KEY).toBe('options-key');
      }
    });

    it('should return null for memory server when no URL available', () => {
      const result = getMcpServerConfig('memory', {});

      expect(result).toBeNull();
    });

    it('should return memory server config with URL from options', () => {
      const options = createDefaultOptions({ memoryMcpUrl: 'http://custom-memory:9000' });
      const result = getMcpServerConfig('memory', options);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('memory');
      expect(result?.transport.type).toBe('streamable-http');
      if (result?.transport.type === 'streamable-http') {
        expect(result.transport.url).toBe('http://custom-memory:9000');
      }
    });

    it('should return memory server config with URL from env', () => {
      const options = createDefaultOptions({
        memoryMcpUrl: undefined,
        env: { GRAPHITI_MCP_URL: 'http://env-memory:8000' },
      });
      const result = getMcpServerConfig('memory', options);

      expect(result).not.toBeNull();
      if (result?.transport.type === 'streamable-http') {
        expect(result.transport.url).toBe('http://env-memory:8000');
      }
    });

    it('should prefer options.memoryMcpUrl over env.GRAPHITI_MCP_URL', () => {
      const options = createDefaultOptions({
        memoryMcpUrl: 'http://options-url',
        env: { GRAPHITI_MCP_URL: 'http://env-url' },
      });
      const result = getMcpServerConfig('memory', options);

      expect(result).not.toBeNull();
      if (result?.transport.type === 'streamable-http') {
        expect(result.transport.url).toBe('http://options-url');
      }
    });
  });

  // ============================================
  // getMcpServerConfig - Unknown Servers
  // ============================================

  describe('getMcpServerConfig - unknown servers', () => {
    it('should return null for unknown server ID', () => {
      const result = getMcpServerConfig('unknown-server');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = getMcpServerConfig('');

      expect(result).toBeNull();
    });

    it('should be case-sensitive for server IDs', () => {
      const result = getMcpServerConfig('Context7'); // uppercase C

      expect(result).toBeNull();
    });
  });

  // ============================================
  // resolveMcpServers
  // ============================================

  describe('resolveMcpServers', () => {
    it('should resolve all known servers when credentials provided', () => {
      const serverIds = ['context7', 'electron', 'puppeteer', 'auto-claude'];
      const options = createDefaultOptions();

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(4);
      expect(result.every((c) => c !== null)).toBe(true);
    });

    it('should filter out servers without required credentials', () => {
      const serverIds = ['context7', 'linear', 'memory'];
      const options = {}; // No credentials

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(1); // Only context7
      expect(result[0].id).toBe('context7');
    });

    it('should include linear when API key is available', () => {
      const serverIds = ['context7', 'linear'];
      const options = createDefaultOptions({ linearApiKey: 'test-key' });

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(2);
    });

    it('should include memory when URL is available', () => {
      const serverIds = ['context7', 'memory'];
      const options = createDefaultOptions({ memoryMcpUrl: 'http://localhost:8000' });

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      const result = resolveMcpServers([]);

      expect(result).toEqual([]);
    });

    it('should handle duplicate server IDs gracefully', () => {
      const serverIds = ['context7', 'context7', 'context7'];
      const options = createDefaultOptions();

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(3); // Returns all successful resolutions
    });

    it('should filter out null results from unknown servers', () => {
      const serverIds = ['context7', 'unknown-server', 'electron'];
      const options = createDefaultOptions();

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(2); // context7 and electron
      expect(result.every((c) => c.id !== 'unknown-server')).toBe(true);
    });

    it('should preserve server order from input', () => {
      const serverIds = ['puppeteer', 'context7', 'electron'];
      const options = createDefaultOptions();

      const result = resolveMcpServers(serverIds, options);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('puppeteer');
      expect(result[1].id).toBe('context7');
      expect(result[2].id).toBe('electron');
    });
  });

  // ============================================
  // Transport Configuration
  // ============================================

  describe('transport configuration', () => {
    it('should configure stdio transport with npx for context7', () => {
      const result = getMcpServerConfig('context7');

      expect(result?.transport.type).toBe('stdio');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.command).toBe('npx');
        expect(result.transport.args).toEqual(['-y', '@upstash/context7-mcp@latest']);
      }
    });

    it('should configure stdio transport with npx for linear', () => {
      const options = createDefaultOptions({ linearApiKey: 'test-key' });
      const result = getMcpServerConfig('linear', options);

      expect(result?.transport.type).toBe('stdio');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.command).toBe('npx');
        expect(result.transport.args).toEqual(['-y', '@linear/mcp-server']);
      }
    });

    it('should configure streamable-http transport for memory', () => {
      const options = createDefaultOptions({ memoryMcpUrl: 'http://localhost:8000' });
      const result = getMcpServerConfig('memory', options);

      expect(result?.transport.type).toBe('streamable-http');
      if (result?.transport.type === 'streamable-http') {
        expect(result.transport.url).toBe('http://localhost:8000');
      }
    });

    it('should configure stdio transport with node for auto-claude', () => {
      const options = createDefaultOptions({ specDir: '/test/spec' });
      const result = getMcpServerConfig('auto-claude', options);

      expect(result?.transport.type).toBe('stdio');
      if (result?.transport.type === 'stdio') {
        expect(result.transport.command).toBe('node');
        expect(result.transport.args).toEqual(['auto-claude-mcp-server.js']);
        expect(result.transport.env?.SPEC_DIR).toBe('/test/spec');
      }
    });
  });

  // ============================================
  // Server Metadata
  // ============================================

  describe('server metadata', () => {
    it('should include description for context7 server', () => {
      const result = getMcpServerConfig('context7');

      expect(result?.description).toBe('Documentation lookup for libraries and frameworks');
    });

    it('should include description for linear server', () => {
      const options = createDefaultOptions({ linearApiKey: 'test-key' });
      const result = getMcpServerConfig('linear', options);

      expect(result?.description).toBe('Project management integration for issues and tasks');
    });

    it('should include description for memory server', () => {
      const options = createDefaultOptions({ memoryMcpUrl: 'http://localhost:8000' });
      const result = getMcpServerConfig('memory', options);

      expect(result?.description).toBe('Knowledge graph memory for cross-session insights');
    });

    it('should include description for electron server', () => {
      const result = getMcpServerConfig('electron');

      expect(result?.description).toBe('Desktop app automation via Chrome DevTools Protocol');
    });

    it('should include description for puppeteer server', () => {
      const result = getMcpServerConfig('puppeteer');

      expect(result?.description).toBe('Web browser automation for frontend validation');
    });

    it('should include description for auto-claude server', () => {
      const result = getMcpServerConfig('auto-claude');

      expect(result?.description).toBe('Build management tools (progress tracking, session context)');
    });
  });

  // ============================================
  // enabledByDefault Flag
  // ============================================

  describe('enabledByDefault flag', () => {
    it('should be true for context7 server', () => {
      const result = getMcpServerConfig('context7');
      expect(result?.enabledByDefault).toBe(true);
    });

    it('should be true for auto-claude server', () => {
      const result = getMcpServerConfig('auto-claude');
      expect(result?.enabledByDefault).toBe(true);
    });

    it('should be false for linear server', () => {
      const options = createDefaultOptions({ linearApiKey: 'test-key' });
      const result = getMcpServerConfig('linear', options);
      expect(result?.enabledByDefault).toBe(false);
    });

    it('should be false for memory server', () => {
      const options = createDefaultOptions({ memoryMcpUrl: 'http://localhost:8000' });
      const result = getMcpServerConfig('memory', options);
      expect(result?.enabledByDefault).toBe(false);
    });

    it('should be false for electron server', () => {
      const result = getMcpServerConfig('electron');
      expect(result?.enabledByDefault).toBe(false);
    });

    it('should be false for puppeteer server', () => {
      const result = getMcpServerConfig('puppeteer');
      expect(result?.enabledByDefault).toBe(false);
    });
  });
});
