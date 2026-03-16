/**
 * PR Review Engine Unit Tests
 * ============================
 *
 * Comprehensive test suite for pr-review-engine.ts covering:
 * - Pure functions: needsDeepAnalysis, deduplicateFindings
 * - AI SDK integration: runReviewPass with mocked generateText
 * - Multi-pass orchestration: runMultiPassReview with parallel execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  Output: {
    object: vi.fn(),
  },
}));

const mockCreateSimpleClient = vi.fn();

vi.mock('../../../client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

// Mock parseLLMJson
vi.mock('../../../schema/structured-output', () => ({
  parseLLMJson: vi.fn((text: string) => {
    // Simple mock that parses JSON if valid
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

// =============================================================================
// Import after mocking
// =============================================================================

import {
  needsDeepAnalysis,
  deduplicateFindings,
  runReviewPass,
  runMultiPassReview,
  ReviewPass,
  type ScanResult,
  type PRReviewFinding,
  type PRContext,
  type PRReviewEngineConfig,
} from '../pr-review-engine';
import { SIMPLE_PR_CONTEXT, COMPLEX_PR_CONTEXT, PR_WITH_AI_COMMENTS } from '@shared/test-utils';

// =============================================================================
// Test Constants & Helpers
// =============================================================================

const mockModel = { modelId: 'claude-3-5-sonnet-20241022' };

function createMockClient(systemPrompt = 'You are a helpful assistant.') {
  return {
    model: mockModel,
    systemPrompt,
  };
}

function createConfig(overrides: Partial<PRReviewEngineConfig> = {}): PRReviewEngineConfig {
  return {
    repo: 'test/repo',
    model: 'sonnet',
    thinkingLevel: 'medium',
    ...overrides,
  };
}

// =============================================================================
// Tests: needsDeepAnalysis() (Pure Function)
// =============================================================================

describe('needsDeepAnalysis', () => {
  it('should return true when total changes exceed 200', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
      verdict: 'approve',
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 150,
      totalDeletions: 100, // 250 total changes
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(true);
  });

  it('should return false when total changes equal exactly 200 (only > 200 triggers)', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 150,
      totalDeletions: 50, // 200 total changes
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(false);
  });

  it('should return false when total changes are under 200 with low complexity', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 100,
      totalDeletions: 50, // 150 total changes
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(false);
  });

  it('should return true when complexity is high', () => {
    const scanResult: ScanResult = {
      complexity: 'high',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 50,
      totalDeletions: 30, // Only 80 total changes
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(true);
  });

  it('should return true when complexity is medium', () => {
    const scanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 100,
      totalDeletions: 50,
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(true);
  });

  it('should return true when risk areas are present', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: ['authentication', 'database'],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 100,
      totalDeletions: 50,
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(true);
  });

  it('should return true for any non-empty risk areas array', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: ['payment-processing'],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 50,
      totalDeletions: 30,
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(true);
  });

  it('should return false for low complexity, no risk areas, under 200 changes', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 100,
      totalDeletions: 50,
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(false);
  });

  it('should handle edge case of zero changes', () => {
    const scanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
    };
    const context: PRContext = {
      ...SIMPLE_PR_CONTEXT,
      totalAdditions: 0,
      totalDeletions: 0,
    };

    expect(needsDeepAnalysis(scanResult, context)).toBe(false);
  });
});

// =============================================================================
// Tests: deduplicateFindings() (Pure Function)
// =============================================================================

describe('deduplicateFindings', () => {
  it('should return empty array for empty input', () => {
    expect(deduplicateFindings([])).toEqual([]);
  });

  it('should return single finding as-is', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(findings[0]);
  });

  it('should remove exact duplicates (same file, line, title)', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SEC-1'); // First one is kept
  });

  it('should treat titles case-insensitively for deduplication', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'QLT-1',
        severity: 'medium',
        category: 'quality',
        title: 'Missing Error Handling',
        description: 'No try-catch',
        file: 'src/api/handler.ts',
        line: 15,
        fixable: true,
      },
      {
        id: 'QLT-2',
        severity: 'medium',
        category: 'quality',
        title: 'missing error handling', // Different case
        description: 'No try-catch',
        file: 'src/api/handler.ts',
        line: 15,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
  });

  it('should treat titles with extra whitespace as duplicates', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'QLT-1',
        severity: 'medium',
        category: 'quality',
        title: 'Missing Error Handling',
        description: 'No try-catch',
        file: 'src/api/handler.ts',
        line: 15,
        fixable: true,
      },
      {
        id: 'QLT-2',
        severity: 'medium',
        category: 'quality',
        title: '  Missing Error Handling  ', // Extra whitespace
        description: 'No try-catch',
        file: 'src/api/handler.ts',
        line: 15,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
  });

  it('should keep findings with different files', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/api/user.ts',
        line: 42,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('should keep findings with different lines', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 78,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('should keep findings with different titles', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'XSS Vulnerability',
        description: 'Unsanitized output',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('should handle multiple duplicates and unique findings', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
        description: 'Vulnerability',
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
        description: 'Duplicate',
      },
      {
        id: 'QLT-1',
        severity: 'medium',
        category: 'quality',
        title: 'Code Duplication',
        file: 'src/utils/helper.ts',
        line: 10,
        fixable: true,
        description: 'Repeated code',
      },
      {
        id: 'SEC-3',
        severity: 'critical',
        category: 'security',
        title: 'Hardcoded Secret',
        file: 'src/config/api.ts',
        line: 5,
        fixable: true,
        description: 'API key exposed',
      },
      {
        id: 'SEC-4',
        severity: 'critical',
        category: 'security',
        title: 'HARDCODED SECRET', // Case insensitive
        file: 'src/config/api.ts',
        line: 5,
        fixable: true,
        description: 'Duplicate',
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(3); // SEC-1, QLT-1, SEC-3 (first occurrences)
  });

  it('should preserve original finding objects (first occurrence)', () => {
    const findings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection',
        description: 'First occurrence',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
      },
      {
        id: 'SEC-2',
        severity: 'medium',
        category: 'security',
        title: 'SQL Injection',
        description: 'Second occurrence (different severity)',
        file: 'src/db/query.ts',
        line: 42,
        fixable: false,
      },
    ];

    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SEC-1');
    expect(result[0].severity).toBe('high');
    expect(result[0].description).toBe('First occurrence');
  });
});

// =============================================================================
// Tests: runReviewPass() (AI SDK Integration)
// =============================================================================

describe('runReviewPass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSimpleClient.mockResolvedValue(createMockClient());
  });

  it('should run quick_scan pass and return ScanResult', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: ['authentication', 'database'],
      verdict: 'needs_review',
      summary: 'PR requires careful review',
    };

    mockGenerateText.mockResolvedValue({
      text: '',
      output: mockScanResult,
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      finishReason: 'stop',
    });

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runReviewPass(ReviewPass.QUICK_SCAN, context, config);

    expect(mockCreateSimpleClient).toHaveBeenCalledWith({
      systemPrompt: 'You are an expert code reviewer. Respond with structured JSON only.',
      modelShorthand: 'sonnet',
      thinkingLevel: 'medium',
    });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockScanResult);
  });

  it('should run security pass and return findings array', async () => {
    const mockFindings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'critical',
        category: 'security',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db/query.ts',
        line: 42,
        fixable: true,
        evidence: "db.query(`SELECT * FROM users WHERE id = '${userId}'`)",
      },
      {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        title: 'Hardcoded API Key',
        description: 'API key exposed in source',
        file: 'src/config/api.ts',
        line: 5,
        fixable: true,
        evidence: 'const API_KEY = "sk_live_12345"',
      },
    ];

    mockGenerateText.mockResolvedValue({
      text: '',
      output: {
        findings: mockFindings,
      },
      usage: { promptTokens: 1500, completionTokens: 800, totalTokens: 2300 },
      finishReason: 'stop',
    } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runReviewPass(ReviewPass.SECURITY, context, config);

    expect(result).toEqual(mockFindings);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('should run quality pass and return findings array', async () => {
    const mockFindings: PRReviewFinding[] = [
      {
        id: 'QLT-1',
        severity: 'medium',
        category: 'quality',
        title: 'Code Duplication',
        description: 'Same logic repeated in multiple functions',
        file: 'src/utils/helpers.ts',
        line: 15,
        fixable: true,
      },
    ];

    mockGenerateText.mockResolvedValue({
      text: '',
      output: {
        findings: mockFindings,
      },
      usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
      finishReason: 'stop',
    } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runReviewPass(ReviewPass.QUALITY, context, config);

    expect(result).toEqual(mockFindings);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should run deep_analysis pass and return findings array', async () => {
    const mockFindings: PRReviewFinding[] = [
      {
        id: 'DEEP-1',
        severity: 'high',
        category: 'quality',
        title: 'Race Condition',
        description: 'Concurrent access to shared state without locking',
        file: 'src/state/store.ts',
        line: 78,
        fixable: false,
      },
    ];

    mockGenerateText.mockResolvedValue({
      text: '',
      output: {
        findings: mockFindings,
      },
      usage: { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
      finishReason: 'stop',
    } as unknown as ReturnType<typeof mockGenerateText>);

    const context = COMPLEX_PR_CONTEXT;
    const config = createConfig();

    const result = await runReviewPass(ReviewPass.DEEP_ANALYSIS, context, config);

    expect(result).toEqual(mockFindings);
  });

  it('should use custom model and thinking level from config', async () => {
    mockGenerateText.mockResolvedValue({
      text: '',
      output: {
        complexity: 'low',
        riskAreas: [],
        verdict: 'approve',
      },
      usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
      finishReason: 'stop',
    });

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig({
      model: 'haiku',
      thinkingLevel: 'low',
    });

    await runReviewPass(ReviewPass.QUICK_SCAN, context, config);

    expect(mockCreateSimpleClient).toHaveBeenCalledWith({
      systemPrompt: 'You are an expert code reviewer. Respond with structured JSON only.',
      modelShorthand: 'haiku',
      thinkingLevel: 'low',
    });
  });

  it('should fall back to text parsing when output is undefined', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: ['authentication'],
      verdict: 'needs_review',
    };

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(mockScanResult),
      output: undefined,
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      finishReason: 'stop',
    });

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runReviewPass(ReviewPass.QUICK_SCAN, context, config);

    expect(result).toEqual(mockScanResult);
  });

  it('should include PR context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValue({
      text: '',
      output: {
        complexity: 'low',
        riskAreas: [],
      },
      usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
      finishReason: 'stop',
    });

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    await runReviewPass(ReviewPass.QUICK_SCAN, context, config);

    const generateCall = mockGenerateText.mock.calls[0];
    const prompt = generateCall[0]?.prompt as string;

    expect(prompt).toContain('Pull Request #42');
    expect(prompt).toContain('Fix user authentication bug');
    expect(prompt).toContain('testuser');
    expect(prompt).toContain('develop');
    expect(prompt).toContain('feature/auth-fix');
    expect(prompt).toContain('50 additions');
    expect(prompt).toContain('7 deletions');
  });
});

// =============================================================================
// Tests: runMultiPassReview() (Orchestration)
// =============================================================================

describe('runMultiPassReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSimpleClient.mockResolvedValue(createMockClient());
  });

  it('should run quick scan first', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
      verdict: 'approve',
    };

    mockGenerateText.mockResolvedValue({
      text: '',
      output: mockScanResult,
      usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
      finishReason: 'stop',
    });

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();
    const progressCallback = vi.fn();

    await runMultiPassReview(context, config, progressCallback);

    // Quick scan should be called first
    expect(mockGenerateText).toHaveBeenCalledTimes(4); // quick_scan + security + quality + structural
    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'quick_scan',
        progress: 35,
        message: 'Pass 1/6: Quick Scan...',
      })
    );
  });

  it('should run parallel specialist passes after quick scan', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: ['authentication'],
      verdict: 'needs_review',
    };

    const mockSecurityFindings: PRReviewFinding[] = [
      {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        title: 'Missing Authentication',
        file: 'src/auth/login.ts',
        line: 10,
        fixable: true,
        description: 'No auth check',
      },
    ];

    const mockQualityFindings: PRReviewFinding[] = [
      {
        id: 'QLT-1',
        severity: 'medium',
        category: 'quality',
        title: 'Poor Error Handling',
        file: 'src/auth/login.ts',
        line: 15,
        fixable: true,
        description: 'No try-catch',
      },
    ];

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: '',
        output: { findings: mockSecurityFindings },
        usage: { promptTokens: 1500, completionTokens: 500, totalTokens: 2000 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValueOnce({
        text: '',
        output: { findings: mockQualityFindings },
        usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValue({
        text: '',
        output: { issues: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runMultiPassReview(context, config);

    expect(result.scanResult).toEqual(mockScanResult);
    expect(result.findings).toHaveLength(2); // SEC-1 + QLT-1
    expect(result.structuralIssues).toEqual([]);
  });

  it('should deduplicate findings from multiple passes', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'high',
      riskAreas: [],
      verdict: 'needs_review',
    };

    const duplicateFinding: PRReviewFinding = {
      id: 'SEC-1',
      severity: 'high',
      category: 'security',
      title: 'SQL Injection',
      description: 'User input not sanitized',
      file: 'src/db/query.ts',
      line: 42,
      fixable: true,
    };

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: '',
        output: { findings: [duplicateFinding] },
        usage: { promptTokens: 1500, completionTokens: 500, totalTokens: 2000 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValueOnce({
        text: '',
        output: { findings: [duplicateFinding] },
        usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValue({
        text: '',
        output: { issues: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runMultiPassReview(context, config);

    // Should deduplicate to single finding
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].id).toBe('SEC-1');
  });

  it('should include deep analysis pass for complex PRs', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'high',
      riskAreas: [],
      verdict: 'needs_review',
    };

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValue({
        text: '',
        output: { findings: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = COMPLEX_PR_CONTEXT; // Large PR with 5000 additions
    const config = createConfig();

    await runMultiPassReview(context, config);

    // Should call 5 passes: quick_scan + security + quality + structural + deep_analysis
    expect(mockGenerateText).toHaveBeenCalledTimes(5);
  });

  it('should run AI comment triage when comments are present', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
      verdict: 'approve',
    };

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValue({
        text: '',
        output: { findings: [], issues: [], triages: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = PR_WITH_AI_COMMENTS; // Has 3 AI bot comments
    const config = createConfig();

    const result = await runMultiPassReview(context, config);

    // Should include triage pass: quick_scan + security + quality + structural + ai_comment_triage
    expect(mockGenerateText).toHaveBeenCalledTimes(5);
    expect(result.aiTriages).toBeDefined();
  });

  it('should report progress through callback', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: [],
      verdict: 'needs_review',
    };

    mockGenerateText.mockResolvedValue({
      text: '',
      output: mockScanResult,
      usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
      finishReason: 'stop',
    } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();
    const progressCallback = vi.fn();

    await runMultiPassReview(context, config, progressCallback);

    expect(progressCallback).toHaveBeenCalled();
    const calls = progressCallback.mock.calls;

    // Check for expected phases
    const phases = calls.map((call) => call[0]?.phase);
    expect(phases).toContain('quick_scan');
    expect(phases).toContain('security');
    expect(phases).toContain('quality');
    expect(phases).toContain('structural');
  });

  it('should handle failed parallel passes gracefully', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
      verdict: 'approve',
    };

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: '',
        output: { findings: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockRejectedValueOnce(new Error('Quality analysis failed'))
      .mockResolvedValue({
        text: '',
        output: { issues: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runMultiPassReview(context, config);

    // Should complete despite failure
    expect(result).toBeDefined();
    expect(result.findings).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('should return complete MultiPassReviewResult structure', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'medium',
      riskAreas: ['authentication'],
      verdict: 'needs_review',
    };

    const mockFinding: PRReviewFinding = {
      id: 'SEC-1',
      severity: 'high',
      category: 'security',
      title: 'Auth Bypass',
      file: 'src/auth/login.ts',
      line: 10,
      fixable: true,
      description: 'Missing auth check',
    };

    const mockStructuralIssue = {
      id: 'STR-1',
      issueType: 'feature_creep',
      severity: 'medium' as const,
      title: 'Scope Creep',
      description: 'Changes beyond stated scope',
      impact: 'PR does more than described',
      suggestion: 'Split into multiple PRs',
    };

    mockGenerateText
      .mockResolvedValueOnce({
        text: '',
        output: mockScanResult,
        usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: '',
        output: { findings: [mockFinding] },
        usage: { promptTokens: 1500, completionTokens: 500, totalTokens: 2000 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValueOnce({
        text: '',
        output: { findings: [] },
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>)
      .mockResolvedValueOnce({
        text: '',
        output: { issues: [mockStructuralIssue] },
        usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
        finishReason: 'stop',
      } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT;
    const config = createConfig();

    const result = await runMultiPassReview(context, config);

    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('structuralIssues');
    expect(result).toHaveProperty('aiTriages');
    expect(result).toHaveProperty('scanResult');
    expect(result.findings).toHaveLength(1);
    expect(result.structuralIssues).toHaveLength(1);
    expect(result.aiTriages).toEqual([]);
    expect(result.scanResult).toEqual(mockScanResult);
  });

  it('should skip deep analysis for simple PRs', async () => {
    const mockScanResult: ScanResult = {
      complexity: 'low',
      riskAreas: [],
      verdict: 'approve',
    };

    mockGenerateText.mockResolvedValue({
      text: '',
      output: mockScanResult,
      usage: { promptTokens: 1000, completionTokens: 300, totalTokens: 1300 },
      finishReason: 'stop',
    } as unknown as ReturnType<typeof mockGenerateText>);

    const context = SIMPLE_PR_CONTEXT; // Only 50 additions
    const config = createConfig();

    await runMultiPassReview(context, config);

    // Should only run 4 passes: quick_scan + security + quality + structural
    // No deep_analysis (low complexity, < 200 changes, no risk areas)
    expect(mockGenerateText).toHaveBeenCalledTimes(4);
  });
});
