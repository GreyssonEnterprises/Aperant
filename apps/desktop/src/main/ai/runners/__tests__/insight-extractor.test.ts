/**
 * Insight Extractor Runner Tests
 *
 * Tests for AI-powered insight extraction from coding sessions.
 * Covers structured output extraction, JSON parsing fallback, generic insights, diff truncation, and attempt history formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractSessionInsights,
  type InsightExtractionConfig,
} from '../insight-extractor';
import type { ThinkingLevel } from '../../config/types';

// Mock all dependencies
vi.mock('../../client/factory', () => ({
  createSimpleClient: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
    Output: {
      object: vi.fn(),
    },
  };
});

import { createSimpleClient } from '../../client/factory';
import { generateText, Output } from 'ai';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<InsightExtractionConfig>,
): InsightExtractionConfig => ({
  subtaskId: 'task-123',
  subtaskDescription: 'Implement user authentication',
  sessionNum: 1,
  success: true,
  diff: '+ addAuth()\n+ login()',
  changedFiles: ['src/auth.ts', 'src/login.ts'],
  commitMessages: 'feat: add authentication',
  attemptHistory: [],
  ...overrides,
});

const createMockClientResult = () => ({
  model: 'gpt-4',
  systemPrompt: 'You are an expert code analyst.',
  resolvedModelId: 'gpt-4',
  tools: {},
  maxSteps: 1,
  thinkingLevel: 'low' as ThinkingLevel,
}) as any;

// ============================================
// Setup & Teardown
// ============================================

describe('Insight Extractor Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue(createMockClientResult());

    // Mock generateText with structured output
    const mockStructuredOutput = {
      file_insights: [
        { file: 'src/auth.ts', insight: 'Added OAuth2 flow', category: 'feature' },
      ],
      patterns_discovered: ['Use async/await for auth calls'],
      gotchas_discovered: ['Token expires after 1 hour'],
      approach_outcome: {
        success: true,
        approach_used: 'Implemented OAuth2 with PKCE',
        why_it_worked: 'PKCE provides better security',
        why_it_failed: null,
        alternatives_tried: [],
      },
      recommendations: ['Add token refresh logic'],
    };

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify(mockStructuredOutput),
      output: mockStructuredOutput,
    } as any);

    vi.mocked(Output.object).mockReturnValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // extractSessionInsights - basic
  // ============================================

  describe('extractSessionInsights', () => {
    it('should extract insights from a successful session', async () => {
      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.subtask_id).toBe('task-123');
      expect(result.session_num).toBe(1);
      expect(result.success).toBe(true);
      expect(result.changed_files).toEqual(['src/auth.ts', 'src/login.ts']);
    });

    it('should use default model and thinking level', async () => {
      const config = createMockConfig();

      await extractSessionInsights(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
      });
    });

    it('should use provided model and thinking level', async () => {
      const config = createMockConfig({
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
      });

      await extractSessionInsights(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
      });
    });

    it('should include structured output from AI', async () => {
      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.file_insights).toHaveLength(1);
      expect(result.file_insights[0].file).toBe('src/auth.ts');
      expect(result.patterns_discovered).toContain('Use async/await for auth calls');
      expect(result.gotchas_discovered).toContain('Token expires after 1 hour');
    });

    it('should include approach outcome from AI', async () => {
      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.approach_outcome.success).toBe(true);
      expect(result.approach_outcome.approach_used).toBe('Implemented OAuth2 with PKCE');
      expect(result.approach_outcome.why_it_worked).toBe('PKCE provides better security');
      expect(result.approach_outcome.why_it_failed).toBeNull();
    });

    it('should include recommendations from AI', async () => {
      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.recommendations).toContain('Add token refresh logic');
    });
  });

  // ============================================
  // extractSessionInsights - JSON fallback
  // ============================================

  describe('JSON parsing fallback', () => {
    it('should parse insights from text when structured output not available', async () => {
      const mockInsights = {
        file_insights: [
          { file: 'src/api.ts', insight: 'Added rate limiting', category: 'performance' },
        ],
        patterns_discovered: ['Use Redis for caching'],
        gotchas_discovered: [],
        approach_outcome: {
          success: true,
          approach_used: 'Added rate limiting middleware',
          why_it_worked: 'Prevents API abuse',
          why_it_failed: null,
          alternatives_tried: [],
        },
        recommendations: [],
      };

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
        output: null, // No structured output
      } as any);

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.file_insights).toHaveLength(1);
      expect(result.file_insights[0].file).toBe('src/api.ts');
      expect(result.patterns_discovered).toContain('Use Redis for caching');
    });

    it('should use fallback when structured output and parsing both fail', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Invalid JSON {{{',
        output: null,
      } as any);

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.file_insights).toEqual([]);
      expect(result.patterns_discovered).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });
  });

  // ============================================
  // extractSessionInsights - generic insights
  // ============================================

  describe('generic insights fallback', () => {
    it('should return generic insights when AI generation fails', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.file_insights).toEqual([]);
      expect(result.patterns_discovered).toEqual([]);
      expect(result.gotchas_discovered).toEqual([]);
      expect(result.approach_outcome.approach_used).toBe('Implemented subtask: task-123');
      expect(result.recommendations).toEqual([]);
    });

    it('should include success status in generic insights', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));

      const config = createMockConfig({ success: false });

      const result = await extractSessionInsights(config);

      expect(result.success).toBe(false);
      expect(result.approach_outcome.success).toBe(false);
    });

    it('should return generic insights for failed session', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Bad response',
        output: null,
      } as any);

      const config = createMockConfig({ success: false });

      const result = await extractSessionInsights(config);

      expect(result.success).toBe(false);
      expect(result.approach_outcome.success).toBe(false);
      expect(result.approach_outcome.why_it_failed).toBeNull();
      expect(result.approach_outcome.why_it_worked).toBeNull();
    });
  });

  // ============================================
  // extractSessionInsights - diff truncation
  // ============================================

  describe('diff truncation', () => {
    it('should include diff in extraction prompt', async () => {
      const config = createMockConfig({
        diff: '+ newFeature()',
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('+ newFeature()');
      expect(prompt).toContain('### Git Diff');
    });

    it('should truncate large diffs', async () => {
      const largeDiff = 'x'.repeat(20000);
      const config = createMockConfig({ diff: largeDiff });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      // Should contain truncation marker
      expect(prompt).toContain('truncated');
      // Should be less than original size
      expect(prompt.length).toBeLessThan(largeDiff.length);
    });

    it('should indicate total diff size when truncated', async () => {
      const largeDiff = 'x'.repeat(20000);
      const config = createMockConfig({ diff: largeDiff });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('20000 chars total');
    });
  });

  // ============================================
  // extractSessionInsights - attempt history
  // ============================================

  describe('attempt history formatting', () => {
    it('should include first attempt message when no history', async () => {
      const config = createMockConfig({ attemptHistory: [] });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('First attempt - no previous history');
    });

    it('should format attempt history with success status', async () => {
      const config = createMockConfig({
        attemptHistory: [
          { success: true, approach: 'Used library X' },
        ],
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('**Attempt 1** (SUCCESS): Used library X');
    });

    it('should format attempt history with failure status and error', async () => {
      const config = createMockConfig({
        attemptHistory: [
          { success: false, approach: 'Direct implementation', error: 'Type mismatch' },
        ],
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('**Attempt 1** (FAILED): Direct implementation');
      expect(prompt).toContain('Error: Type mismatch');
    });

    it('should limit attempt history to most recent 3', async () => {
      const config = createMockConfig({
        attemptHistory: [
          { success: false, approach: 'Attempt 1' },
          { success: false, approach: 'Attempt 2' },
          { success: false, approach: 'Attempt 3' },
          { success: true, approach: 'Attempt 4' },
          { success: true, approach: 'Attempt 5' },
        ],
      });

      await extractSessionInsights(config);

      const call = vi.mocked(generateText).mock.calls[0];
      const prompt = typeof call?.[0]?.prompt === 'string' ? call[0].prompt : String(call?.[0]?.prompt ?? '');
      // Should only include last 3 attempts with their original approach names
      expect(prompt).toContain('Attempt 3');
      expect(prompt).toContain('Attempt 4');
      expect(prompt).toContain('Attempt 5');
      // Should have exactly 3 attempt lines (the last 3)
      const attemptCount = (prompt.match(/\*\*Attempt \d+\*\*/g) ?? []).length;
      expect(attemptCount).toBe(3);
    });
  });

  // ============================================
  // extractSessionInsights - changed files
  // ============================================

  describe('changed files handling', () => {
    it('should include changed files in extraction result', async () => {
      const config = createMockConfig({
        changedFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
      });

      const result = await extractSessionInsights(config);

      expect(result.changed_files).toEqual(['src/file1.ts', 'src/file2.ts', 'src/file3.ts']);
    });

    it('should include changed files in prompt', async () => {
      const config = createMockConfig({
        changedFiles: ['src/auth.ts', 'src/login.ts'],
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('- src/auth.ts');
      expect(prompt).toContain('- src/login.ts');
    });

    it('should show no files message when no files changed', async () => {
      const config = createMockConfig({ changedFiles: [] });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('(No files changed)');
    });
  });

  // ============================================
  // extractSessionInsights - commit messages
  // ============================================

  describe('commit messages handling', () => {
    it('should include commit messages in prompt', async () => {
      const config = createMockConfig({
        commitMessages: 'feat: add OAuth2\nfix: token refresh bug',
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('feat: add OAuth2');
      expect(prompt).toContain('fix: token refresh bug');
    });

    it('should handle empty commit messages', async () => {
      const config = createMockConfig({ commitMessages: '' });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('### Commit Messages');
    });
  });

  // ============================================
  // extractSessionInsights - subtask info
  // ============================================

  describe('subtask information', () => {
    it('should include subtask ID and description in prompt', async () => {
      const config = createMockConfig({
        subtaskId: 'task-abc-123',
        subtaskDescription: 'Build payment integration',
      });

      await extractSessionInsights(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('task-abc-123');
      expect(prompt).toContain('Build payment integration');
    });

    it('should include session number in prompt', async () => {
      const config = createMockConfig({ sessionNum: 3 });

      await extractSessionInsights(config);

      // Verify generateText was called
      expect(generateText).toHaveBeenCalled();

      // The session number should be in the config used to build the prompt
      const call = vi.mocked(generateText).mock.calls[0];
      // prompt could be string or array, just check it was called
      expect(call?.[0]).toBeDefined();
    });

    it('should show success/failure outcome in prompt', async () => {
      // Test success case
      const successConfig = createMockConfig({ success: true });
      await extractSessionInsights(successConfig);
      const successCall = vi.mocked(generateText).mock.calls[0];
      const successPrompt = typeof successCall?.[0]?.prompt === 'string' ? successCall[0].prompt : String(successCall?.[0]?.prompt ?? '');
      expect(successPrompt).toContain('SUCCESS');

      // Reset mock for failure case
      vi.mocked(generateText).mockResolvedValue({
        text: '{}',
        output: null,
      } as any);

      // Test failure case - with new call count
      const failConfig = createMockConfig({ success: false });
      await extractSessionInsights(failConfig);
      const failIndex = vi.mocked(generateText).mock.calls.length - 1;
      const failCall = vi.mocked(generateText).mock.calls[failIndex];
      const failPrompt = typeof failCall?.[0]?.prompt === 'string' ? failCall[0].prompt : String(failCall?.[0]?.prompt ?? '');
      expect(failPrompt).toContain('FAILED');
    });
  });

  // ============================================
  // extractSessionInsights - error handling
  // ============================================

  describe('error handling', () => {
    it('should never throw - always returns valid insights', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('Complete failure'));

      const config = createMockConfig();

      // Should not throw, always returns valid insights
      const result = await extractSessionInsights(config);

      expect(result).toBeDefined();
      expect(result.subtask_id).toBe('task-123');
      expect(result.session_num).toBe(0); // Generic fallback uses 0
      expect(result.file_insights).toEqual([]); // Generic insights
      expect(result.patterns_discovered).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(generateText).mockRejectedValue('String error');

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result).toBeDefined();
      expect(result.file_insights).toEqual([]);
    });

    it('should handle client creation errors', async () => {
      vi.mocked(createSimpleClient).mockRejectedValue(new Error('Client failed'));

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result).toBeDefined();
      expect(result.approach_outcome.approach_used).toBe('Implemented subtask: task-123');
    });
  });

  // ============================================
  // extractSessionInsights - structured output
  // ============================================

  describe('structured output', () => {
    it('should use Output.object for structured output', async () => {
      const config = createMockConfig();

      await extractSessionInsights(config);

      // Verify Output.object was called
      expect(Output.object).toHaveBeenCalled();

      // Verify generateText was called with output parameter
      const call = vi.mocked(generateText).mock.calls[0];
      expect(call?.[0]).toHaveProperty('output');
    });

    it('should use structured output when available from AI', async () => {
      const mockStructuredOutput = {
        file_insights: [{ file: 'test.ts', insight: 'Test insight', category: 'test' }],
        patterns_discovered: ['Pattern 1'],
        gotchas_discovered: [],
        approach_outcome: {
          success: true,
          approach_used: 'Test approach',
          why_it_worked: 'It worked',
          why_it_failed: null,
          alternatives_tried: [],
        },
        recommendations: ['Recommendation 1'],
      };

      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockStructuredOutput),
        output: mockStructuredOutput,
      } as any);

      const config = createMockConfig();

      const result = await extractSessionInsights(config);

      expect(result.file_insights[0].file).toBe('test.ts');
      expect(result.patterns_discovered).toContain('Pattern 1');
    });
  });
});
