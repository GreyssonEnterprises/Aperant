/**
 * impact-analyzer.test.ts — Tests for impact analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeImpact, formatImpactResult } from '../../graph/impact-analyzer';
import type { GraphDatabase } from '../../graph/graph-database';
import type { ImpactResult } from '../../types';

describe('analyzeImpact', () => {
  let mockGraphDb: GraphDatabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGraphDb = {
      analyzeImpact: vi.fn(),
    } as unknown as GraphDatabase;
  });

  it('delegates to graph database with capped depth', async () => {
    const mockResult: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'verifyJwt',
        filePath: 'auth/tokens.ts',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    };

    vi.mocked(mockGraphDb.analyzeImpact).mockResolvedValue(mockResult);

    const result = await analyzeImpact('auth/tokens.ts:verifyJwt', 'proj-1', mockGraphDb, 10);

    expect(mockGraphDb.analyzeImpact).toHaveBeenCalledWith('auth/tokens.ts:verifyJwt', 'proj-1', 5); // Cap at 5
    expect(result).toEqual(mockResult);
  });

  it('uses default depth of 3 when not specified', async () => {
    vi.mocked(mockGraphDb.analyzeImpact).mockResolvedValue({
      target: { nodeId: 'node-1', label: 'test', filePath: 'test.ts' },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    });

    await analyzeImpact('test', 'proj-1', mockGraphDb);

    expect(mockGraphDb.analyzeImpact).toHaveBeenCalledWith('test', 'proj-1', 3);
  });

  it('passes through target string as-is', async () => {
    vi.mocked(mockGraphDb.analyzeImpact).mockResolvedValue({
      target: { nodeId: 'node-1', label: 'test', filePath: 'test.ts' },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    });

    const target = 'src/auth/tokens.ts:verifyJwt';
    await analyzeImpact(target, 'proj-1', mockGraphDb);

    expect(mockGraphDb.analyzeImpact).toHaveBeenCalledWith(target, 'proj-1', 3);
  });
});

describe('formatImpactResult', () => {
  it('formats message when no node found', () => {
    const result: ImpactResult = {
      target: {
        nodeId: '',
        label: 'unknownSymbol',
        filePath: '',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('No node found for target');
    expect(formatted).toContain('unknownSymbol');
  });

  it('formats direct dependents', () => {
    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'verifyJwt',
        filePath: 'auth/tokens.ts',
      },
      directDependents: [
        { nodeId: 'node-2', label: 'authMiddleware', filePath: 'middleware/auth.ts', edgeType: 'CALLS' },
        { nodeId: 'node-3', label: 'refreshToken', filePath: 'auth/refresh.ts', edgeType: 'CALLS' },
      ],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('Impact Analysis: verifyJwt');
    expect(formatted).toContain('File: auth/tokens.ts');
    expect(formatted).toContain('Direct dependents (2)');
    expect(formatted).toContain('- authMiddleware [CALLS] in middleware/auth.ts');
    expect(formatted).toContain('- refreshToken [CALLS] in auth/refresh.ts');
  });

  it('formats transitive dependents with depth and truncates at 20', () => {
    const transitive = Array.from({ length: 25 }, (_, i) => ({
      nodeId: `node-${i}`,
      label: `dependent-${i}`,
      filePath: `path/file-${i}.ts`,
      depth: Math.floor(i / 5) + 2,
    }));

    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'baseFunction',
        filePath: 'base.ts',
      },
      directDependents: [],
      transitiveDependents: transitive,
      affectedTests: [],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('Transitive dependents (25)');
    expect(formatted).toContain('[depth=2] dependent-0');
    expect(formatted).toContain('... and 5 more');
  });

  it('formats affected test files', () => {
    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'verifyJwt',
        filePath: 'auth/tokens.ts',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [
        { filePath: 'auth/tokens.test.ts' },
        { filePath: 'middleware/auth.test.ts' },
      ],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('Affected test files (2)');
    expect(formatted).toContain('- auth/tokens.test.ts');
    expect(formatted).toContain('- middleware/auth.test.ts');
  });

  it('formats affected memories with truncation', () => {
    const longContent = 'This is a very long memory content that should be truncated when displayed in the impact result output. '.repeat(10);

    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'verifyJwt',
        filePath: 'auth/tokens.ts',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [
        { memoryId: 'mem-1', type: 'gotcha', content: longContent },
        { memoryId: 'mem-2', type: 'pattern', content: 'Short pattern' },
      ],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('Related memories (2)');
    expect(formatted).toContain('[gotcha]');
    expect(formatted).toContain('...');
    expect(formatted).toContain('[pattern]');
    expect(formatted).toContain('Short pattern');
  });

  it('formats leaf node message when no dependents', () => {
    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'unusedFunction',
        filePath: 'utils/orphan.ts',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('No dependents found');
    expect(formatted).toContain('leaf node');
  });

  it('handles external file path (undefined)', () => {
    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'externalModule',
        filePath: '',
      },
      directDependents: [],
      transitiveDependents: [],
      affectedTests: [],
      affectedMemories: [],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('File: (external)');
  });

  it('combines all sections when present', () => {
    const result: ImpactResult = {
      target: {
        nodeId: 'node-1',
        label: 'coreFunction',
        filePath: 'core.ts',
      },
      directDependents: [
        { nodeId: 'node-2', label: 'dep1', filePath: 'a.ts', edgeType: 'CALLS' },
      ],
      transitiveDependents: [
        { nodeId: 'node-3', label: 'trans1', filePath: 'b.ts', depth: 2 },
      ],
      affectedTests: [
        { filePath: 'core.test.ts' },
      ],
      affectedMemories: [
        { memoryId: 'mem-1', type: 'gotcha', content: 'Memory content' },
      ],
    };

    const formatted = formatImpactResult(result);

    expect(formatted).toContain('Impact Analysis: coreFunction');
    expect(formatted).toContain('Direct dependents (1)');
    expect(formatted).toContain('Transitive dependents (1)');
    expect(formatted).toContain('Affected test files (1)');
    expect(formatted).toContain('Related memories (1)');
  });
});
