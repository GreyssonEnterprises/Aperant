/**
 * Merge Resolver Runner Tests
 *
 * Tests for AI-powered merge conflict resolution.
 * Covers conflict resolution, resolver function creation, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveMergeConflict,
  createMergeResolverFn,
  type MergeResolverConfig,
  type MergeResolverResult,
  type MergeResolverCallFn,
} from '../merge-resolver';
import type { ModelShorthand, ThinkingLevel } from '../../config/types';

// Mock all dependencies
vi.mock('../../client/factory', () => ({
  createSimpleClient: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { createSimpleClient } from '../../client/factory';
import { generateText } from 'ai';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<MergeResolverConfig>,
): MergeResolverConfig => ({
  systemPrompt: 'You are a merge resolver. Resolve the conflict.',
  userPrompt: 'Resolve this merge conflict...',
  ...overrides,
});

const createMockClientResult = () => ({
  model: 'gpt-4',
  systemPrompt: 'You are a merge resolver.',
  resolvedModelId: 'gpt-4',
  tools: {},
  maxSteps: 100,
  thinkingLevel: 'low' as ThinkingLevel,
}) as any;

// ============================================
// Setup & Teardown
// ============================================

describe('Merge Resolver Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue(createMockClientResult());
    // Mock generateText
    vi.mocked(generateText).mockResolvedValue({ text: 'Resolved content' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // resolveMergeConflict
  // ============================================

  describe('resolveMergeConflict', () => {
    it('should resolve a merge conflict successfully', async () => {
      const config = createMockConfig();

      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Resolved content');
      expect(result.error).toBeUndefined();
    });

    it('should use default model and thinking level when not specified', async () => {
      const config = createMockConfig();

      await resolveMergeConflict(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: config.systemPrompt,
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
      });
    });

    it('should use provided model and thinking level', async () => {
      const config = createMockConfig({
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
      });

      await resolveMergeConflict(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: config.systemPrompt,
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
      });
    });

    it('should handle empty AI response', async () => {
      vi.mocked(generateText).mockResolvedValue({ text: '   ' } as any);

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.error).toBe('Empty response from AI');
    });

    it('should handle AI generation errors', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API rate limit exceeded'));

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.error).toBe('API rate limit exceeded');
    });

    it('should handle client creation errors', async () => {
      vi.mocked(createSimpleClient).mockRejectedValue(new Error('Invalid model'));

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.error).toBe('Invalid model');
    });

    it('should trim whitespace from resolved text', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '  \n  Resolved content  \n  ',
      } as any);

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Resolved content');
    });

    it('should pass system prompt and user prompt to AI', async () => {
      vi.clearAllMocks();
      vi.mocked(createSimpleClient).mockImplementation(async ({ systemPrompt }) => ({
        model: 'gpt-4',
        systemPrompt,
        resolvedModelId: 'gpt-4',
        tools: {},
        maxSteps: 100,
        thinkingLevel: 'low' as any,
      } as any));
      vi.mocked(generateText).mockResolvedValue({ text: 'Resolved' } as any);

      const config: MergeResolverConfig = {
        systemPrompt: 'You are a merge resolver for JavaScript files.',
        userPrompt: 'Merge these two functions...',
      };

      await resolveMergeConflict(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: config.systemPrompt,
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
      });

      expect(generateText).toHaveBeenCalledWith({
        model: 'gpt-4',
        system: config.systemPrompt,
        prompt: config.userPrompt,
      });
    });
  });

  // ============================================
  // createMergeResolverFn
  // ============================================

  describe('createMergeResolverFn', () => {
    it('should create a resolver function', () => {
      const resolverFn = createMergeResolverFn();

      expect(typeof resolverFn).toBe('function');
    });

    it('should use default model and thinking level when not specified', async () => {
      const resolverFn = createMergeResolverFn();

      await resolverFn('System prompt', 'User prompt');

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: 'System prompt',
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
      });
    });

    it('should use provided model and thinking level', async () => {
      const resolverFn = createMergeResolverFn('sonnet', 'high');

      await resolverFn('System prompt', 'User prompt');

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: 'System prompt',
        modelShorthand: 'sonnet',
        thinkingLevel: 'high',
      });
    });

    it('should return only the resolved text', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Resolved merge content',
      } as any);

      const resolverFn = createMergeResolverFn();

      const result = await resolverFn('System', 'User');

      expect(result).toBe('Resolved merge content');
    });

    it('should propagate errors from resolveMergeConflict', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('Generation failed'));

      const resolverFn = createMergeResolverFn();

      // The function should still return a string (empty on error)
      const result = await resolverFn('System', 'User');

      expect(result).toBe('');
    });

    it('should handle empty responses gracefully', async () => {
      vi.mocked(generateText).mockResolvedValue({ text: '' } as any);

      const resolverFn = createMergeResolverFn();

      const result = await resolverFn('System', 'User');

      expect(result).toBe('');
    });

    it('should match MergeResolverCallFn type signature', async () => {
      const resolverFn: MergeResolverCallFn = createMergeResolverFn();

      // This is a compile-time check - if it compiles, the type is correct
      expect(resolverFn).toBeDefined();

      const result = await resolverFn('System', 'User');
      expect(typeof result).toBe('string');
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should handle non-Error objects in catch block', async () => {
      vi.mocked(generateText).mockRejectedValue('String error');

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should handle null errors', async () => {
      vi.mocked(generateText).mockRejectedValue(null);

      const config = createMockConfig();
      const result = await resolveMergeConflict(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('null');
    });
  });

  // ============================================
  // Integration with AI SDK
  // ============================================

  describe('AI SDK integration', () => {
    it('should call generateText with correct parameters', async () => {
      vi.clearAllMocks();
      const clientResult = createMockClientResult();
      vi.mocked(createSimpleClient).mockImplementation(async (config) => ({
        ...clientResult,
        systemPrompt: config.systemPrompt,
      } as any));
      vi.mocked(generateText).mockResolvedValue({ text: 'Resolved' } as any);

      const config = createMockConfig();

      await resolveMergeConflict(config);

      expect(generateText).toHaveBeenCalledWith({
        model: 'gpt-4',
        system: config.systemPrompt,
        prompt: config.userPrompt,
      });
    });

    it('should use model from client result', async () => {
      vi.clearAllMocks();
      vi.mocked(createSimpleClient).mockImplementation(async () => ({
        model: 'claude-3-opus',
        systemPrompt: 'System',
        resolvedModelId: 'claude-3-opus',
        tools: {},
        maxSteps: 100,
        thinkingLevel: 'low' as ThinkingLevel,
      } as any));
      vi.mocked(generateText).mockResolvedValue({ text: 'Resolved' } as any);

      const config = createMockConfig();

      await resolveMergeConflict(config);

      expect(generateText).toHaveBeenCalledWith({
        model: 'claude-3-opus',
        system: 'System',
        prompt: config.userPrompt,
      });
    });
  });
});
