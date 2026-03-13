/**
 * prefetch-builder.test.ts — Tests for prefetch plan builder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPrefetchPlan } from '../../injection/prefetch-builder';
import type { MemoryService, Memory } from '../../types';

describe('buildPrefetchPlan', () => {
  let mockMemoryService: MemoryService;

  function makeMockMemory(
    id: string,
    content: string,
    relatedModules: string[] = []
  ): Memory {
    return {
      id,
      type: 'prefetch_pattern',
      content,
      confidence: 0.9,
      tags: [],
      relatedFiles: [],
      relatedModules,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      scope: 'module',
      source: 'observer_inferred',
      sessionId: 'test-session',
      provenanceSessionIds: [],
      projectId: 'proj-1',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockMemoryService = {
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
    } as unknown as MemoryService;
  });

  it('builds plan from prefetch pattern memories', async () => {
    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          alwaysReadFiles: ['src/auth/tokens.ts', 'src/middleware/auth.ts'],
          frequentlyReadFiles: ['src/utils/helpers.ts'],
        }),
        ['auth']
      ),
      makeMockMemory(
        'mem-2',
        JSON.stringify({
          alwaysReadFiles: ['src/config.ts'],
          frequentlyReadFiles: ['src/auth/tokens.ts'], // Duplicate, should be deduplicated
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(mockMemoryService.search).toHaveBeenCalledWith({
      types: ['prefetch_pattern'],
      relatedModules: ['auth'],
      limit: 5,
      projectId: 'proj-1',
    });

    expect(plan.alwaysReadFiles).toContain('src/auth/tokens.ts');
    expect(plan.alwaysReadFiles).toContain('src/middleware/auth.ts');
    expect(plan.alwaysReadFiles).toContain('src/config.ts');
    expect(plan.frequentlyReadFiles).toContain('src/utils/helpers.ts');
    expect(plan.frequentlyReadFiles).toContain('src/auth/tokens.ts');
    expect(plan.totalTokenBudget).toBe(32768);
    expect(plan.maxFiles).toBe(12);
  });

  it('deduplicates files across memories', async () => {
    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          alwaysReadFiles: ['src/auth/tokens.ts'],
          frequentlyReadFiles: ['src/utils/a.ts'],
        }),
        ['auth']
      ),
      makeMockMemory(
        'mem-2',
        JSON.stringify({
          alwaysReadFiles: ['src/auth/tokens.ts'], // Duplicate across memories
          frequentlyReadFiles: ['src/utils/a.ts'], // Duplicate across memories
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    // Files are deduplicated via Set before slicing
    expect(plan.alwaysReadFiles).toContain('src/auth/tokens.ts');
    expect(plan.frequentlyReadFiles).toContain('src/utils/a.ts');

    // Verify no duplicates in the result
    const uniqueAlwaysFiles = new Set(plan.alwaysReadFiles);
    const uniqueFrequentFiles = new Set(plan.frequentlyReadFiles);
    expect(uniqueAlwaysFiles.size).toBe(plan.alwaysReadFiles.length);
    expect(uniqueFrequentFiles.size).toBe(plan.frequentlyReadFiles.length);
  });

  it('limits files to 12 per category', async () => {
    const manyFiles = Array.from({ length: 20 }, (_, i) => `src/file-${i}.ts`);

    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          alwaysReadFiles: manyFiles,
          frequentlyReadFiles: manyFiles,
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles.length).toBe(12);
    expect(plan.frequentlyReadFiles.length).toBe(12);
    expect(plan.maxFiles).toBe(12);
  });

  it('returns empty plan when no memories found', async () => {
    vi.mocked(mockMemoryService.search).mockResolvedValue([]);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles).toEqual([]);
    expect(plan.frequentlyReadFiles).toEqual([]);
    expect(plan.totalTokenBudget).toBe(32768);
    expect(plan.maxFiles).toBe(12);
  });

  it('handles malformed JSON content gracefully', async () => {
    const mockMemories = [
      makeMockMemory('mem-1', 'invalid json {', ['auth']),
      makeMockMemory(
        'mem-2',
        JSON.stringify({
          alwaysReadFiles: ['src/good.ts'],
          frequentlyReadFiles: ['src/freq.ts'],
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    // Should skip malformed memory and process valid one
    expect(plan.alwaysReadFiles).toContain('src/good.ts');
    expect(plan.frequentlyReadFiles).toContain('src/freq.ts');
  });

  it('handles missing arrays in content', async () => {
    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          // Missing alwaysReadFiles
          frequentlyReadFiles: ['src/freq.ts'],
        }),
        ['auth']
      ),
      makeMockMemory(
        'mem-2',
        JSON.stringify({
          alwaysReadFiles: ['src/always.ts'],
          // Missing frequentlyReadFiles
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles).toContain('src/always.ts');
    expect(plan.frequentlyReadFiles).toContain('src/freq.ts');
  });

  it('handles non-array values in content', async () => {
    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          alwaysReadFiles: 'not-an-array',
          frequentlyReadFiles: { also: 'not-an-array' },
        }),
        ['auth']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles).toEqual([]);
    expect(plan.frequentlyReadFiles).toEqual([]);
  });

  it('returns empty plan on service error', async () => {
    vi.mocked(mockMemoryService.search).mockRejectedValue(new Error('Service unavailable'));

    const plan = await buildPrefetchPlan(['auth'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles).toEqual([]);
    expect(plan.frequentlyReadFiles).toEqual([]);
    expect(plan.totalTokenBudget).toBe(32768);
    expect(plan.maxFiles).toBe(12);
  });

  it('passes modules array to search', async () => {
    vi.mocked(mockMemoryService.search).mockResolvedValue([]);

    await buildPrefetchPlan(['auth', 'database', 'api'], mockMemoryService, 'proj-1');

    expect(mockMemoryService.search).toHaveBeenCalledWith({
      types: ['prefetch_pattern'],
      relatedModules: ['auth', 'database', 'api'],
      limit: 5,
      projectId: 'proj-1',
    });
  });

  it('merges files from multiple memories', async () => {
    const mockMemories = [
      makeMockMemory(
        'mem-1',
        JSON.stringify({
          alwaysReadFiles: ['src/auth/tokens.ts'],
          frequentlyReadFiles: ['src/auth/middleware.ts'],
        }),
        ['auth']
      ),
      makeMockMemory(
        'mem-2',
        JSON.stringify({
          alwaysReadFiles: ['src/database/client.ts'],
          frequentlyReadFiles: ['src/database/schema.ts'],
        }),
        ['database']
      ),
    ];

    vi.mocked(mockMemoryService.search).mockResolvedValue(mockMemories);

    const plan = await buildPrefetchPlan(['auth', 'database'], mockMemoryService, 'proj-1');

    expect(plan.alwaysReadFiles).toContain('src/auth/tokens.ts');
    expect(plan.alwaysReadFiles).toContain('src/database/client.ts');
    expect(plan.frequentlyReadFiles).toContain('src/auth/middleware.ts');
    expect(plan.frequentlyReadFiles).toContain('src/database/schema.ts');
  });
});
