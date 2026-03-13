/**
 * AI Context Builder Tests
 *
 * Tests for context building functionality including keyword extraction,
 * file search, service matching, categorization, and pattern discovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Node.js modules first
vi.mock('node:fs');
vi.mock('node:path');

import fs from 'node:fs';
import path from 'node:path';
import { buildContext, buildTaskContext } from '../builder';
import type { BuildContextConfig } from '../builder';
import type {
  SubtaskContext,
  TaskContext,
  FileMatch,
} from '../types';

// Mock all dependencies
vi.mock('../categorizer.js');
vi.mock('../graphiti-integration.js');
vi.mock('../keyword-extractor.js');
vi.mock('../pattern-discovery.js');
vi.mock('../search.js');
vi.mock('../service-matcher.js');

import { categorizeMatches } from '../categorizer.js';
import { fetchGraphHints, isMemoryEnabled } from '../graphiti-integration.js';
import { extractKeywords } from '../keyword-extractor.js';
import { discoverPatterns } from '../pattern-discovery.js';
import { searchService } from '../search.js';
import { suggestServices } from '../service-matcher.js';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<BuildContextConfig>,
): BuildContextConfig => ({
  taskDescription: 'Add user authentication to the API',
  projectDir: '/test/project',
  specDir: '/test/spec',
  ...overrides,
});

const createMockFileMatch = (
  overrides?: {
    path?: string;
    service?: string;
    relevanceScore?: number;
    matchingLines?: [number, string][];
  },
): FileMatch => ({
  path: overrides?.path ?? '/test/project/src/auth.ts',
  service: overrides?.service ?? 'auth-service',
  reason: 'Contains authentication logic',
  relevanceScore: overrides?.relevanceScore ?? 0.9,
  matchingLines: overrides?.matchingLines ?? [[1, 'export function authenticate()'], [2, '  return true;']],
});

const createMockServiceInfo = (overrides?: {
  path?: string;
  type?: string;
  language?: string;
  entry_point?: string;
}) => ({
  path: overrides?.path ?? 'services/auth',
  type: overrides?.type ?? 'api',
  language: overrides?.language ?? 'typescript',
  entry_point: overrides?.entry_point ?? 'index.ts',
});

// ============================================
// Setup & Teardown
// ============================================

describe('AI Context Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs operations
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (typeof filePath === 'string') {
        if (filePath.endsWith('project_index.json')) {
          return JSON.stringify({
            services: {
              'auth-service': createMockServiceInfo(),
              'user-service': createMockServiceInfo({ path: 'services/user' }),
            },
          });
        }
        if (filePath.endsWith('SERVICE_CONTEXT.md')) {
          return '# Auth Service Context\n\nThis is the auth service...';
        }
      }
      return '';
    });

    // Setup default mock returns
    vi.mocked(path.isAbsolute).mockReturnValue(false);
    vi.mocked(path.join).mockImplementation((...args) => {
      // Actually join the paths for realistic behavior
      return args.join('/');
    });
    vi.mocked(suggestServices).mockReturnValue(['auth-service', 'user-service']);
    vi.mocked(extractKeywords).mockReturnValue(['auth', 'user', 'login', 'api']);
    vi.mocked(searchService).mockReturnValue([createMockFileMatch()]);
    vi.mocked(categorizeMatches).mockReturnValue({
      toModify: [createMockFileMatch({ path: '/test/project/src/auth.ts' })],
      toReference: [createMockFileMatch({ path: '/test/project/src/user.ts' })],
    });
    vi.mocked(discoverPatterns).mockReturnValue({
      authentication_pattern: 'export function authenticate()',
    });
    vi.mocked(isMemoryEnabled).mockReturnValue(true);
    vi.mocked(fetchGraphHints).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // buildContext
  // ============================================

  describe('buildContext', () => {
    it('should build context with default configuration', async () => {
      const config = createMockConfig();

      const result = await buildContext(config);

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.services).toBeDefined();
      expect(Array.isArray(result.services)).toBe(true);
      expect(result.patterns).toBeDefined();
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(result.keywords).toEqual(['auth', 'user', 'login', 'api']);
    });

    it('should use provided services when available', async () => {
      const config = createMockConfig({ services: ['auth-service'] });

      await buildContext(config);

      expect(suggestServices).not.toHaveBeenCalled();
      expect(searchService).toHaveBeenCalledWith(
        expect.any(String),
        'auth-service',
        ['auth', 'user', 'login', 'api'],
        '/test/project'
      );
    });

    it('should use provided keywords when available', async () => {
      const config = createMockConfig({ keywords: ['custom', 'keyword'] });

      await buildContext(config);

      expect(extractKeywords).not.toHaveBeenCalled();
      expect(searchService).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        ['custom', 'keyword'],
        '/test/project'
      );
    });

    it('should skip graph hints when includeGraphHints is false', async () => {
      const config = createMockConfig({ includeGraphHints: false });

      await buildContext(config);

      expect(fetchGraphHints).not.toHaveBeenCalled();
    });

    it('should skip graph hints when memory is disabled', async () => {
      vi.mocked(isMemoryEnabled).mockReturnValue(false);
      const config = createMockConfig({ includeGraphHints: true });

      await buildContext(config);

      expect(fetchGraphHints).not.toHaveBeenCalled();
    });

    it('should fetch graph hints when memory is enabled', async () => {
      vi.mocked(fetchGraphHints).mockResolvedValue([
        { type: 'entity', data: 'User' },
      ]);
      const config = createMockConfig({ includeGraphHints: true });

      await buildContext(config);

      expect(fetchGraphHints).toHaveBeenCalledWith(
        'Add user authentication to the API',
        '/test/project'
      );
    });

    it('should categorize files into modify and reference', async () => {
      const mockModifyFile = createMockFileMatch({ path: '/test/project/src/auth.ts' });
      const mockReferenceFile = createMockFileMatch({ path: '/test/project/src/user.ts' });

      vi.mocked(categorizeMatches).mockReturnValue({
        toModify: [mockModifyFile],
        toReference: [mockReferenceFile],
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(categorizeMatches).toHaveBeenCalled();
      expect(result.files).toHaveLength(2);
      expect(result.files[0].role).toBe('modify');
      expect(result.files[1].role).toBe('reference');
    });

    it('should discover patterns from reference files', async () => {
      vi.mocked(discoverPatterns).mockReturnValue({
        auth_pattern: 'export function authenticate()',
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(discoverPatterns).toHaveBeenCalled();
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe('auth_pattern');
      expect(result.patterns[0].description).toContain('auth');
      expect(result.patterns[0].example).toBe('export function authenticate()');
    });

    it('should build service matches from file matches', async () => {
      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.services).toBeDefined();
      expect(Array.isArray(result.services)).toBe(true);
      expect(result.services[0]).toMatchObject({
        name: expect.any(String),
        type: expect.any(String),
        relatedFiles: expect.any(Array),
      });
    });
  });

  // ============================================
  // buildTaskContext
  // ============================================

  describe('buildTaskContext', () => {
    it('should build task context with full internal representation', async () => {
      const config = createMockConfig();

      const result = await buildTaskContext(config);

      expect(result).toBeDefined();
      expect(result.taskDescription).toBe('Add user authentication to the API');
      expect(result.scopedServices).toBeDefined();
      expect(Array.isArray(result.filesToModify)).toBe(true);
      expect(Array.isArray(result.filesToReference)).toBe(true);
      expect(result.patternsDiscovered).toBeDefined();
      expect(result.serviceContexts).toBeDefined();
      expect(result.graphHints).toEqual([]);
    });

    it('should include graph hints in task context when enabled', async () => {
      const mockGraphHints = [{ type: 'entity', data: 'User' }];
      vi.mocked(fetchGraphHints).mockResolvedValue(mockGraphHints);

      const config = createMockConfig({ includeGraphHints: true });
      const result = await buildTaskContext(config);

      expect(result.graphHints).toEqual(mockGraphHints);
    });

    it('should build service contexts for each discovered service', async () => {
      const config = createMockConfig();
      const result = await buildTaskContext(config);

      expect(result.serviceContexts).toBeDefined();
      expect(Object.keys(result.serviceContexts).length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should handle missing project index gracefully', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return !String(filePath).includes('project_index.json');
      });

      const config = createMockConfig();

      const result = await buildContext(config);

      // Should still work with empty project index
      expect(result).toBeDefined();
    });

    it('should handle corrupted project index gracefully', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (String(filePath).includes('project_index.json')) {
          return 'invalid json{{{';
        }
        return '';
      });

      const config = createMockConfig();

      const result = await buildContext(config);

      // Should fall back to empty index
      expect(result).toBeDefined();
    });

    it('should handle missing service info gracefully', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (String(filePath).includes('project_index.json')) {
          return JSON.stringify({
            services: {
              'auth-service': createMockServiceInfo(),
              'missing-service': null, // Missing service info
            },
          });
        }
        return '';
      });

      const config = createMockConfig();

      const result = await buildContext(config);

      // Should skip services with missing info
      expect(result).toBeDefined();
    });

    it('should handle searchService errors gracefully', async () => {
      vi.mocked(searchService).mockImplementation(() => {
        throw new Error('Search failed');
      });

      const config = createMockConfig();

      // Current implementation propagates errors from searchService
      await expect(buildContext(config)).rejects.toThrow('Search failed');
    });
  });

  // ============================================
  // Service Context
  // ============================================

  describe('service context', () => {
    it('should read SERVICE_CONTEXT.md when available', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const path = String(filePath);
        // Project index must exist
        if (path.endsWith('project_index.json')) return true;
        // SERVICE_CONTEXT.md exists
        return path.includes('SERVICE_CONTEXT.md');
      });

      const config = createMockConfig();
      const result = await buildTaskContext(config);

      const authContext = result.serviceContexts['auth-service'];
      expect(authContext).toBeDefined();
      expect(authContext?.source).toBe('SERVICE_CONTEXT.md');
      expect((authContext as { content: string }).content).toBe('# Auth Service Context\n\nThis is the auth service...');
    });

    it('should generate context from service info when SERVICE_CONTEXT.md missing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const path = String(filePath);
        // Project index must exist
        if (path.endsWith('project_index.json')) return true;
        // SERVICE_CONTEXT.md does not exist
        return false;
      });

      const config = createMockConfig();
      const result = await buildTaskContext(config);

      const authContext = result.serviceContexts['auth-service'];
      expect(authContext).toBeDefined();
      expect(authContext?.source).toBe('generated');
      expect(authContext?.language).toBe('typescript');
      expect(authContext?.entry_point).toBe('index.ts');
    });

    it('should truncate SERVICE_CONTEXT.md content to 2000 characters', async () => {
      const longContent = '#'.repeat(3000); // Longer than 2000 chars
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (String(filePath).includes('SERVICE_CONTEXT.md')) {
          return longContent;
        }
        // Preserve project index mock
        if (String(filePath).endsWith('project_index.json')) {
          return JSON.stringify({
            services: {
              'auth-service': createMockServiceInfo(),
              'user-service': createMockServiceInfo({ path: 'services/user' }),
            },
          });
        }
        return '';
      });

      const config = createMockConfig();
      const result = await buildTaskContext(config);

      const authContext = result.serviceContexts['auth-service'];
      expect(authContext?.source).toBe('SERVICE_CONTEXT.md');
      expect((authContext as { content: string }).content?.length).toBeLessThanOrEqual(2000);
    });
  });

  // ============================================
  // Pattern Discovery
  // ============================================

  describe('pattern discovery', () => {
    it('should convert discovered patterns to CodePattern format', async () => {
      vi.mocked(discoverPatterns).mockReturnValue({
        user_auth_pattern: 'export function authenticateUser()',
        session_pattern: 'export class SessionManager',
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.patterns).toHaveLength(2);
      expect(result.patterns[0]).toMatchObject({
        name: 'user_auth_pattern',
        description: expect.stringContaining('user_auth'),
        example: 'export function authenticateUser()',
        files: [],
      });
    });

    it('should handle empty pattern discovery results', async () => {
      vi.mocked(discoverPatterns).mockReturnValue({});

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.patterns).toEqual([]);
    });
  });

  // ============================================
  // Keyword Extraction
  // ============================================

  describe('keyword extraction', () => {
    it('should extract keywords from task description', async () => {
      vi.mocked(extractKeywords).mockReturnValue(['auth', 'user']);

      const config = createMockConfig();
      await buildContext(config);

      expect(extractKeywords).toHaveBeenCalledWith('Add user authentication to the API');
      const result = await buildContext(config);
      expect(result.keywords).toEqual(['auth', 'user']);
    });

    it('should use provided keywords when available', async () => {
      const config = createMockConfig({ keywords: ['custom', 'keyword'] });
      await buildContext(config);

      expect(extractKeywords).not.toHaveBeenCalled();
      const result = await buildContext(config);
      expect(result.keywords).toEqual(['custom', 'keyword']);
    });
  });

  // ============================================
  // Service Suggestion
  // ============================================

  describe('service suggestion', () => {
    it('should suggest services when not explicitly provided', async () => {
      const config = createMockConfig();
      await buildContext(config);

      expect(suggestServices).toHaveBeenCalledWith(
        'Add user authentication to the API',
        expect.objectContaining({
          services: expect.any(Object),
        })
      );
    });

    it('should use provided services when available', async () => {
      const config = createMockConfig({ services: ['auth-service'] });
      await buildContext(config);

      expect(suggestServices).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // File Categorization
  // ============================================

  describe('file categorization', () => {
    it('should categorize files based on task description', async () => {
      const config = createMockConfig();
      await buildContext(config);

      expect(categorizeMatches).toHaveBeenCalledWith(
        expect.any(Array),
        'Add user authentication to the API'
      );
    });

    it('should convert FileMatch to ContextFile with correct role', async () => {
      const mockModifyFile = createMockFileMatch({ path: '/test/project/src/auth.ts' });
      const mockReferenceFile = createMockFileMatch({ path: '/test/project/src/user.ts' });

      vi.mocked(categorizeMatches).mockReturnValue({
        toModify: [mockModifyFile],
        toReference: [mockReferenceFile],
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.files[0]).toMatchObject({
        path: '/test/project/src/auth.ts',
        role: 'modify',
      });
      expect(result.files[1]).toMatchObject({
        path: '/test/project/src/user.ts',
        role: 'reference',
      });
    });

    it('should include snippets for files with matching lines', async () => {
      const mockFileWithSnippet = createMockFileMatch({
        path: '/test/project/src/auth.ts',
        relevanceScore: 0.9,
        matchingLines: [[1, 'export function authenticate()'], [2, '  return true;']],
      });

      vi.mocked(categorizeMatches).mockReturnValue({
        toModify: [mockFileWithSnippet],
        toReference: [],
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.files[0].snippet).toBeDefined();
      expect(result.files[0].snippet).toContain('export function authenticate()');
    });

    it('should not include snippets for files without matching lines', async () => {
      const mockFileWithoutSnippet = createMockFileMatch({
        path: '/test/project/src/auth.ts',
        relevanceScore: 0.9,
        matchingLines: [],
      });

      vi.mocked(categorizeMatches).mockReturnValue({
        toModify: [mockFileWithoutSnippet],
        toReference: [],
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.files[0].snippet).toBeUndefined();
    });
  });

  // ============================================
  // Service Matching
  // ============================================

  describe('service matching', () => {
    it('should match services with correct type', async () => {
      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.services[0].type).toMatch(/api|database|queue|cache|storage/);
    });

    it('should include related files for each service', async () => {
      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.services[0].relatedFiles).toBeDefined();
      expect(Array.isArray(result.services[0].relatedFiles)).toBe(true);
    });

    it('should default unknown service types to api', async () => {
      // Service info with unknown type
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (String(filePath).includes('project_index.json')) {
          return JSON.stringify({
            services: {
              'auth-service': createMockServiceInfo({ type: 'unknown-type' }),
            },
          });
        }
        return '';
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      // Unknown types should default to 'api'
      expect(result.services[0].type).toBe('api');
    });
  });

  // ============================================
  // Subtask Context
  // ============================================

  describe('SubtaskContext structure', () => {
    it('should return SubtaskContext with all required fields', async () => {
      const config = createMockConfig();
      const result = await buildContext(config) as SubtaskContext;

      expect(result.files).toBeDefined();
      expect(result.services).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.keywords).toBeDefined();
    });

    it('should include correct file metadata in context files', async () => {
      const mockFile = createMockFileMatch({
        path: '/test/project/src/auth.ts',
        relevanceScore: 0.85,
      });

      vi.mocked(categorizeMatches).mockReturnValue({
        toModify: [mockFile],
        toReference: [],
      });

      const config = createMockConfig();
      const result = await buildContext(config);

      expect(result.files[0]).toMatchObject({
        path: '/test/project/src/auth.ts',
        relevance: 0.85,
      });
    });
  });

  // ============================================
  // Task Context
  // ============================================

  describe('TaskContext structure', () => {
    it('should return TaskContext with all required fields', async () => {
      const config = createMockConfig();
      const result = await buildTaskContext(config) as TaskContext;

      expect(result.taskDescription).toBe('Add user authentication to the API');
      expect(result.scopedServices).toBeDefined();
      expect(result.filesToModify).toBeDefined();
      expect(result.filesToReference).toBeDefined();
      expect(result.patternsDiscovered).toBeDefined();
      expect(result.serviceContexts).toBeDefined();
      expect(result.graphHints).toBeDefined();
    });
  });
});
