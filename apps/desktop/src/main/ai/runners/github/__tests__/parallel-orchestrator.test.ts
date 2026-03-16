/**
 * Parallel Orchestrator Unit Tests
 * ================================
 *
 * Comprehensive test suite for parallel-orchestrator.ts covering:
 * - Constructor instantiation
 * - review() method with mocked streamText
 * - Parallel specialist execution
 * - Verdict mapping
 * - Abort signal handling
 * - Specialist failure handling
 *
 * Note: Cross-validation tests are complex due to MD5-based finding IDs.
 * The tests focus on orchestrator behavior that can be reliably tested.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

const mockStreamText = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: vi.fn((count: number) => ({ type: 'step-count', maxSteps: count })),
  Output: {
    object: vi.fn((schema: unknown) => schema),
  },
}));

const mockCreateSimpleClient = vi.fn();

vi.mock('../../../client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

const mockLoadPrompt = vi.fn();

vi.mock('../../../prompts/prompt-loader', () => ({
  loadPrompt: (...args: unknown[]) => mockLoadPrompt(...args),
}));

const mockBuildToolRegistry = vi.fn();

vi.mock('../../../tools/build-registry', () => ({
  buildToolRegistry: (...args: unknown[]) => mockBuildToolRegistry(...args),
}));

const mockGetSecurityProfile = vi.fn();

vi.mock('../../../security/security-profile', () => ({
  getSecurityProfile: (...args: unknown[]) => mockGetSecurityProfile(...args),
}));

const mockGetAgentConfig = vi.fn();

vi.mock('../../../config/agent-configs', () => ({
  getAgentConfig: (...args: unknown[]) => mockGetAgentConfig(...args),
}));

// =============================================================================
// Import after mocking
// =============================================================================

import {
  ParallelOrchestratorReviewer,
  MergeVerdict,
  type ParallelOrchestratorConfig,
} from '../parallel-orchestrator';
import { createMockPRContext } from '@shared/test-utils';
import type { ProgressCallback } from '../pr-review-engine';

// =============================================================================
// Test Constants & Helpers
// =============================================================================

const mockModel = { modelId: 'claude-3-5-sonnet-20241022' };

function createMockClient(
  model = mockModel,
  systemPrompt = 'You are a helpful assistant.'
): { model: typeof mockModel; systemPrompt: string } {
  return { model, systemPrompt };
}

function createConfig(overrides: Partial<ParallelOrchestratorConfig> = {}): ParallelOrchestratorConfig {
  return {
    repo: 'test/repo',
    projectDir: '/tmp/test-project',
    model: 'sonnet',
    thinkingLevel: 'medium',
    ...overrides,
  };
}

function createMockStreamResult(
  text: string,
  object: unknown = null,
  finishReason: 'stop' | 'length' | 'error' = 'stop'
): {
  text: string;
  output: unknown;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: 'stop' | 'length' | 'error';
  fullStream: AsyncIterable<unknown>;
} {
  async function* generateFullStream() {
    yield { type: 'text-delta', textDelta: text };
    yield { type: 'finish', finishReason, usage: { promptTokens: 1000, completionTokens: 500 } };
  }

  return {
    text,
    output: object,
    usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    finishReason,
    fullStream: generateFullStream(),
  };
}

// =============================================================================
// Tests: Constructor
// =============================================================================

describe('ParallelOrchestratorReviewer - Constructor', () => {
  it('should create instance with config', () => {
    const config = createConfig();
    const reviewer = new ParallelOrchestratorReviewer(config);

    expect(reviewer).toBeInstanceOf(ParallelOrchestratorReviewer);
  });

  it('should accept optional progress callback', () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const config = createConfig();
    const reviewer = new ParallelOrchestratorReviewer(config, progressCallback);

    expect(reviewer).toBeInstanceOf(ParallelOrchestratorReviewer);
  });

  it('should create instance without progress callback', () => {
    const config = createConfig();
    const reviewer = new ParallelOrchestratorReviewer(config);

    expect(reviewer).toBeInstanceOf(ParallelOrchestratorReviewer);
  });
});

// =============================================================================
// Tests: review() - Happy Path
// =============================================================================

describe('ParallelOrchestratorReviewer - review() Happy Path', () => {
  let progressCallback: ProgressCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    progressCallback = vi.fn() as unknown as ProgressCallback;

    // Setup default mocks
    mockLoadPrompt.mockResolvedValue('You are a specialist reviewer.');
    mockCreateSimpleClient.mockReturnValue(createMockClient());
    mockBuildToolRegistry.mockReturnValue({ getToolsForAgent: vi.fn(() => ({})) });
    mockGetSecurityProfile.mockReturnValue({
      allowedCommands: [],
      allowedPaths: [],
    });
    mockGetAgentConfig.mockReturnValue({
      agentType: 'pr_specialist',
      model: 'sonnet',
      systemPrompt: 'You are a specialist.',
      tools: [],
    });
  });

  it('should run all 4 specialists in parallel', async () => {
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to return no findings (simplest case)
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('Complete', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    // Should call 4 specialists (no synthesis when no findings)
    expect(mockStreamText).toHaveBeenCalledTimes(4);
    expect(result.agentsInvoked).toEqual(['security', 'quality', 'logic', 'codebase-fit']);
    expect(result.verdict).toBe(MergeVerdict.READY_TO_MERGE);
  });

  it('should synthesize verdict correctly - READY_TO_MERGE with no findings', async () => {
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to return no findings
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('No issues', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    // When no findings, synthesis returns early with default verdict
    expect(result.verdict).toBe(MergeVerdict.READY_TO_MERGE);
    expect(result.verdictReasoning).toBe('No issues found by any specialist reviewer.');
    expect(result.blockers).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it('should call progress callback for each phase', async () => {
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to return no findings
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('Complete', { findings: [] })
      );
    }

    await reviewer.review(context);

    // Should have progress updates
    expect(progressCallback).toHaveBeenCalled();
  });

  it('should handle findings from specialists', async () => {
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to return no findings except one
    mockStreamText
      .mockResolvedValueOnce(createMockStreamResult('Complete', {
        findings: [{ title: 'Security issue', file: 'src/test.ts', line: 10, severity: 'high', category: 'security' }],
      }))
      .mockResolvedValueOnce(createMockStreamResult('Complete', { findings: [] }))
      .mockResolvedValueOnce(createMockStreamResult('Complete', { findings: [] }))
      .mockResolvedValueOnce(createMockStreamResult('Complete', { findings: [] }));

    const result = await reviewer.review(context);

    // Should call 4 specialists
    expect(mockStreamText).toHaveBeenCalledTimes(4);
    expect(result.agentsInvoked).toEqual(['security', 'quality', 'logic', 'codebase-fit']);
  });
});

// =============================================================================
// Tests: Abort Signal Handling
// =============================================================================

describe('ParallelOrchestratorReviewer - Abort Signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLoadPrompt.mockResolvedValue('You are a specialist reviewer.');
    mockCreateSimpleClient.mockReturnValue(createMockClient());
    mockBuildToolRegistry.mockReturnValue({ getToolsForAgent: vi.fn(() => ({})) });
    mockGetSecurityProfile.mockReturnValue({
      allowedCommands: [],
      allowedPaths: [],
    });
    mockGetAgentConfig.mockReturnValue({
      agentType: 'pr_specialist',
      model: 'sonnet',
      systemPrompt: 'You are a specialist.',
      tools: [],
    });
  });

  it('should handle abort signal during specialist execution', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    const abortController = new AbortController();
    abortController.abort();

    // Mock streamText to check for abort
    mockStreamText.mockImplementation(async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
      if (abortSignal?.aborted) {
        throw new Error('Aborted');
      }
      return createMockStreamResult('Complete', { findings: [] });
    });

    // Should handle abort gracefully
    const result = await reviewer.review(context, abortController.signal);

    expect(result).toBeDefined();
    expect(result.findings).toEqual([]);
  });

  it('should stop processing when abort signal is received mid-execution', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    const abortController = new AbortController();

    // Abort after first call
    let callCount = 0;
    mockStreamText.mockImplementation(async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
      callCount++;
      if (callCount > 2) {
        abortController.abort();
      }
      if (abortSignal?.aborted) {
        return createMockStreamResult('Aborted', { findings: [] });
      }
      return createMockStreamResult('Complete', { findings: [] });
    });

    const result = await reviewer.review(context, abortController.signal);

    expect(result).toBeDefined();
  });
});

// =============================================================================
// Tests: Specialist Failure Handling
// =============================================================================

describe('ParallelOrchestratorReviewer - Specialist Failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLoadPrompt.mockResolvedValue('You are a specialist reviewer.');
    mockCreateSimpleClient.mockReturnValue(createMockClient());
    mockBuildToolRegistry.mockReturnValue({ getToolsForAgent: vi.fn(() => ({})) });
    mockGetSecurityProfile.mockReturnValue({
      allowedCommands: [],
      allowedPaths: [],
    });
    mockGetAgentConfig.mockReturnValue({
      agentType: 'pr_specialist',
      model: 'sonnet',
      systemPrompt: 'You are a specialist.',
      tools: [],
    });
  });

  it('should handle specialist failures with Promise.allSettled', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock 2 specialists to succeed, 2 to fail
    mockStreamText
      .mockResolvedValueOnce(createMockStreamResult('Success', { findings: [] }))
      .mockRejectedValueOnce(new Error('Specialist failed'))
      .mockResolvedValueOnce(createMockStreamResult('Success', { findings: [] }))
      .mockRejectedValueOnce(new Error('Another specialist failed'));

    // Mock synthesis (no findings from successful specialists)
    mockStreamText.mockResolvedValueOnce(
      createMockStreamResult('Complete', {
        verdict: 'ready_to_merge',
        verdictReasoning: 'Partial success',
        kept_finding_ids: [],
        removed_finding_ids: [],
        removal_reasons: {},
      })
    );

    const result = await reviewer.review(context);

    // Should complete with partial results
    expect(result).toBeDefined();
    expect(result.agentsInvoked).toEqual(['security', 'quality', 'logic', 'codebase-fit']);
  });

  it('should continue with remaining specialists when one fails', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock first specialist to fail, others to succeed
    mockStreamText
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(createMockStreamResult('Success', { findings: [] }))
      .mockResolvedValueOnce(createMockStreamResult('Success', { findings: [] }))
      .mockResolvedValueOnce(createMockStreamResult('Success', { findings: [] }));

    // Mock synthesis
    mockStreamText.mockResolvedValueOnce(
      createMockStreamResult('Complete', {
        verdict: 'ready_to_merge',
        verdictReasoning: 'Completed with partial results',
        kept_finding_ids: [],
        removed_finding_ids: [],
        removal_reasons: {},
      })
    );

    const result = await reviewer.review(context);

    expect(result).toBeDefined();
    expect(result.agentsInvoked.length).toBe(4);
  });

  it('should handle all specialists failing', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to fail
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockRejectedValueOnce(new Error('All failed'));
    }

    // Mock synthesis to handle empty findings
    mockStreamText.mockResolvedValueOnce(
      createMockStreamResult('No findings', {
        verdict: 'ready_to_merge',
        verdictReasoning: 'No specialists returned findings',
        kept_finding_ids: [],
        removed_finding_ids: [],
        removal_reasons: {},
      })
    );

    const result = await reviewer.review(context);

    expect(result).toBeDefined();
    expect(result.findings).toEqual([]);
  });
});

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe('ParallelOrchestratorReviewer - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLoadPrompt.mockResolvedValue('You are a specialist reviewer.');
    mockCreateSimpleClient.mockReturnValue(createMockClient());
    mockBuildToolRegistry.mockReturnValue({ getToolsForAgent: vi.fn(() => ({})) });
    mockGetSecurityProfile.mockReturnValue({
      allowedCommands: [],
      allowedPaths: [],
    });
    mockGetAgentConfig.mockReturnValue({
      agentType: 'pr_specialist',
      model: 'sonnet',
      systemPrompt: 'You are a specialist.',
      tools: [],
    });
  });

  it('should handle empty findings from all specialists', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock all specialists to return empty findings
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('No issues', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    expect(result.findings).toEqual([]);
    expect(result.verdict).toBe(MergeVerdict.READY_TO_MERGE);
    expect(result.blockers).toEqual([]);
  });

  // Note: Testing synthesis failure requires complex mock setup due to MD5-based finding IDs
  // This is tested in integration tests instead


  it('should handle complex PR with many files', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);

    const context = createMockPRContext({
      prNumber: 42,
      changedFiles: Array.from({ length: 50 }, (_, i) => ({
        path: `src/file${i}.ts`,
        additions: 10,
        deletions: 5,
        status: 'modified',
        patch: `@@ -1,1 +1,2 @@\n-line\n+line`,
      })),
      totalAdditions: 500,
      totalDeletions: 250,
    });

    // Mock specialists
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('Review complete', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    expect(result).toBeDefined();
    expect(result.verdict).toBe(MergeVerdict.READY_TO_MERGE);
  });
});

// =============================================================================
// Tests: Result Structure
// =============================================================================

describe('ParallelOrchestratorReviewer - Result Structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLoadPrompt.mockResolvedValue('You are a specialist reviewer.');
    mockCreateSimpleClient.mockReturnValue(createMockClient());
    mockBuildToolRegistry.mockReturnValue({ getToolsForAgent: vi.fn(() => ({})) });
    mockGetSecurityProfile.mockReturnValue({
      allowedCommands: [],
      allowedPaths: [],
    });
    mockGetAgentConfig.mockReturnValue({
      agentType: 'pr_specialist',
      model: 'sonnet',
      systemPrompt: 'You are a specialist.',
      tools: [],
    });
  });

  it('should return result with all required fields', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock specialists
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('Complete', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('verdictReasoning');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('blockers');
    expect(result).toHaveProperty('agentsInvoked');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.agentsInvoked)).toBe(true);
    expect(typeof result.verdict).toBe('string');
    expect(typeof result.verdictReasoning).toBe('string');
    expect(typeof result.summary).toBe('string');
  });

  it('should include summary with verdict', async () => {
    const progressCallback = vi.fn() as unknown as ProgressCallback;
    const reviewer = new ParallelOrchestratorReviewer(createConfig(), progressCallback);
    const context = createMockPRContext({ prNumber: 42 });

    // Mock specialists
    for (let i = 0; i < 4; i++) {
      mockStreamText.mockResolvedValueOnce(
        createMockStreamResult('Complete', { findings: [] })
      );
    }

    const result = await reviewer.review(context);

    expect(result.summary).toContain('Review:');
    expect(result.summary).toContain('Ready To Merge');
    expect(result.summary).toContain('✅');
  });
});
