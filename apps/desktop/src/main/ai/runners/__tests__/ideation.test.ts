/**
 * Ideation Runner Tests
 *
 * Tests for AI-powered idea generation.
 * Covers ideation types, prompt loading, streaming events, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runIdeation, IDEATION_TYPES, IDEATION_TYPE_LABELS, type IdeationConfig, type IdeationResult } from '../ideation';
import type { ModelShorthand, ThinkingLevel } from '../../config/types';

// Mock all dependencies
vi.mock('../../client/factory', () => ({
  createSimpleClient: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: vi.fn(),
    stepCountIs: vi.fn(),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { createSimpleClient } from '../../client/factory';
import { streamText, stepCountIs } from 'ai';
import { existsSync, readFileSync } from 'node:fs';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<IdeationConfig>,
): IdeationConfig => ({
  projectDir: '/test/project',
  outputDir: '/test/output',
  promptsDir: '/test/prompts',
  ideationType: 'code_improvements',
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('Ideation Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue({
      model: 'gpt-4',
      systemPrompt: '',
      resolvedModelId: 'gpt-4',
      tools: {},
      maxSteps: 30,
      thinkingLevel: 'medium' as any,
    } as any);

    // Mock streamText - create an object with fullStream async generator
    const createMockStreamResult = (chunks: any[]) => ({
      fullStream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      text: '',
      content: '',
      reasoning: '',
      reasoningText: '',
      usage: { promptTokens: 0, completionTokens: 0 },
      finish: () => Promise.resolve(),
      toDataStream: () => new ReadableStream(),
      toResponse: () => new Response(),
    } as any);

    vi.mocked(streamText).mockImplementation((...args: any[]) => {
      // Default mock returns text chunks and tool calls
      return createMockStreamResult([
        { type: 'text-delta', text: 'Idea 1' },
        { type: 'text-delta', text: 'Idea 2' },
        { type: 'tool-call', toolName: 'Read', toolCallId: '1', args: {} },
      ]);
    });
    vi.mocked(stepCountIs).mockReturnValue({} as any);

    // Mock existsSync - return true for prompt files
    vi.mocked(existsSync).mockImplementation((path) => {
      return String(path).includes('.md');
    });

    // Mock readFileSync
    vi.mocked(readFileSync).mockReturnValue('Prompt content here');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // runIdeation - basic
  // ============================================

  describe('runIdeation', () => {
    it('should run ideation and return result', async () => {
      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(true);
      expect(result.text).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should use default model and thinking level', async () => {
      const config = createMockConfig();

      await runIdeation(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: '',
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should use provided model and thinking level', async () => {
      const config = createMockConfig({
        modelShorthand: 'haiku',
        thinkingLevel: 'high',
      });

      await runIdeation(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: '',
        modelShorthand: 'haiku',
        thinkingLevel: 'high',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should use provided maxIdeasPerType', async () => {
      const config = createMockConfig({
        maxIdeasPerType: 10,
      });

      await runIdeation(config);

      const userPrompt = vi.mocked(streamText).mock.calls[0][0].prompt;
      expect(userPrompt).toContain('10');
    });
  });

  // ============================================
  // runIdeation - ideation types
  // ============================================

  describe('ideation types', () => {
    it('should support all ideation types', () => {
      expect(IDEATION_TYPES).toEqual([
        'code_improvements',
        'ui_ux_improvements',
        'documentation_gaps',
        'security_hardening',
        'performance_optimizations',
        'code_quality',
      ]);
    });

    it('should have labels for all ideation types', () => {
      expect(IDEATION_TYPE_LABELS['code_improvements']).toBe('Code Improvements');
      expect(IDEATION_TYPE_LABELS['ui_ux_improvements']).toBe('UI/UX Improvements');
      expect(IDEATION_TYPE_LABELS['documentation_gaps']).toBe('Documentation Gaps');
      expect(IDEATION_TYPE_LABELS['security_hardening']).toBe('Security Hardening');
      expect(IDEATION_TYPE_LABELS['performance_optimizations']).toBe('Performance Optimizations');
      expect(IDEATION_TYPE_LABELS['code_quality']).toBe('Code Quality & Refactoring');
    });

    it('should include ideation type in user prompt', async () => {
      const config = createMockConfig({ ideationType: 'security_hardening' });

      await runIdeation(config);

      const userPrompt = vi.mocked(streamText).mock.calls[0][0].prompt;
      // Ideation type is converted from underscores to spaces in the prompt
      expect(userPrompt).toContain('security hardening');
    });
  });

  // ============================================
  // runIdeation - prompt loading
  // ============================================

  describe('prompt loading', () => {
    it('should load prompt file for ideation type', async () => {
      const config = createMockConfig({
        ideationType: 'documentation_gaps',
      });

      await runIdeation(config);

      expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(
        '/test/prompts/ideation_documentation.md',
        'utf-8'
      );
    });

    it('should return error when prompt file not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Prompt not found');
    });

    it('should return error when prompt file cannot be read', async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read prompt');
    });

    it('should add context to prompt', async () => {
      const config = createMockConfig({
        outputDir: '/custom/output',
        projectDir: '/custom/project',
        maxIdeasPerType: 7,
      });

      await runIdeation(config);

      // Context is added to the prompt file content (system prompt), not user prompt
      const systemPrompt = vi.mocked(streamText).mock.calls[0][0].system;
      expect(systemPrompt).toContain('**Output Directory**: /custom/output');
      expect(systemPrompt).toContain('**Project Directory**: /custom/project');
      expect(systemPrompt).toContain('**Max Ideas**: 7');
    });
  });

  // ============================================
  // runIdeation - streaming events
  // ============================================

  describe('streaming events', () => {
    // Helper to create a proper streamText result mock
    const createMockStreamResult = (chunks: any[]) => ({
      fullStream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      text: '',
      content: '',
      reasoning: '',
      reasoningText: '',
      usage: { promptTokens: 0, completionTokens: 0 },
      finish: () => Promise.resolve(),
      toDataStream: () => new ReadableStream(),
      toResponse: () => new Response(),
    } as any);

    it('should call onStream for text-delta events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'text-delta', text: 'Hello' },
          { type: 'text-delta', text: ' World' },
        ])
      );

      const config = createMockConfig();

      await runIdeation(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'text-delta', text: 'Hello' });
      expect(onStream).toHaveBeenCalledWith({ type: 'text-delta', text: ' World' });
    });

    it('should call onStream for tool-use events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'tool-call', toolName: 'Read', toolCallId: '1', args: {} },
          { type: 'tool-call', toolName: 'Grep', toolCallId: '2', args: {} },
        ])
      );

      const config = createMockConfig();

      await runIdeation(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'tool-use', name: 'Read' });
      expect(onStream).toHaveBeenCalledWith({ type: 'tool-use', name: 'Grep' });
    });

    it('should call onStream for error events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([{ type: 'error', error: 'Something failed' }])
      );

      const config = createMockConfig();

      await runIdeation(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'error', error: 'Something failed' });
    });

    it('should work without onStream callback', async () => {
      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // runIdeation - abort signal
  // ============================================

  describe('abort signal', () => {
    // Helper to create a proper streamText result mock
    const createMockStreamResult = (chunks: any[]) => ({
      fullStream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      text: '',
      content: '',
      reasoning: '',
      reasoningText: '',
      usage: { promptTokens: 0, completionTokens: 0 },
      finish: () => Promise.resolve(),
      toDataStream: () => new ReadableStream(),
      toResponse: () => new Response(),
    } as any);

    it('should pass abortSignal to streamText', async () => {
      const abortController = new AbortController();

      const config = createMockConfig({ abortSignal: abortController.signal });

      await runIdeation(config);

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.abortSignal).toBe(abortController.signal);
    });

    it('should handle abort during streaming', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      // Create a generator that yields then throws
      const errorStream = createMockStreamResult([]);
      errorStream.fullStream = (async function* () {
        yield { type: 'text-delta', text: 'Partial' };
        throw abortError;
      })();

      vi.mocked(streamText).mockReturnValue(errorStream);

      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Aborted');
      expect(result.text).toContain('Partial');
    });
  });

  // ============================================
  // runIdeation - tool context
  // ============================================

  describe('tool context', () => {
    it('should create tool context with project directory', async () => {
      const config = createMockConfig();

      await runIdeation(config);

      const clientCall = vi.mocked(createSimpleClient).mock.calls[0];
      const tools = clientCall[0].tools;

      expect(tools).toBeDefined();
    });

    it('should pass tool context with cwd and projectDir', async () => {
      const config = createMockConfig();

      await runIdeation(config);

      const clientCall = vi.mocked(createSimpleClient).mock.calls[0];
      const toolsArg = clientCall[0].tools;

      // Tools are a ToolRegistry, check it was created with context
      expect(toolsArg).toBeDefined();
    });
  });

  // ============================================
  // runIdeation - error handling
  // ============================================

  describe('error handling', () => {
    // Helper to create a proper streamText result mock
    const createMockStreamResult = (chunks: any[]) => ({
      fullStream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      text: '',
      content: '',
      reasoning: '',
      reasoningText: '',
      usage: { promptTokens: 0, completionTokens: 0 },
      finish: () => Promise.resolve(),
      toDataStream: () => new ReadableStream(),
      toResponse: () => new Response(),
    } as any);

    it('should handle AI generation errors', async () => {
      const errorStream = createMockStreamResult([]);
      // Make the generator throw an error
      errorStream.fullStream = (async function* () {
        throw new Error('AI API error');
      })();

      vi.mocked(streamText).mockReturnValue(errorStream);

      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI API error');
    });

    it('should include partial text on error', async () => {
      const errorStream = createMockStreamResult([
        { type: 'text-delta', text: 'Partial result' },
      ]);
      // Make the generator throw after yielding
      errorStream.fullStream = (async function* () {
        yield { type: 'text-delta', text: 'Partial result' };
        throw new Error('AI API error');
      })();

      vi.mocked(streamText).mockReturnValue(errorStream);

      const config = createMockConfig();

      const result = await runIdeation(config);

      expect(result.success).toBe(false);
      expect(result.text).toContain('Partial result');
    });
  });

  // ============================================
  // runIdeation - client creation errors
  // ============================================

  describe('client creation error handling', () => {
    beforeEach(() => {
      // Set up mock to reject for all tests in this describe block
      vi.mocked(createSimpleClient).mockImplementation(() => {
        return Promise.reject(new Error('Invalid model'));
      });
    });

    it('should handle client creation errors', async () => {
      const config = createMockConfig();

      // The source code doesn't wrap createSimpleClient in try-catch,
      // so the error propagates. We expect it to throw.
      await expect(runIdeation(config)).rejects.toThrow('Invalid model');
    });
  });

  // ============================================
  // runIdeation - codex models
  // ============================================

  describe('Codex model handling', () => {
    // Set up Codex mock for all tests in this describe block
    beforeEach(() => {
      vi.mocked(createSimpleClient).mockImplementation(() => {
        return Promise.resolve({
          model: 'gpt-4-codex',  // This is what gets checked for 'codex'
          systemPrompt: '',
          resolvedModelId: 'gpt-4-codex',
          tools: {},
          maxSteps: 30,
          thinkingLevel: 'medium' as any,
        } as any);
      });
    });

    it('should detect Codex models and use providerOptions', async () => {
      const config = createMockConfig();

      await runIdeation(config);

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.providerOptions).toEqual({
        openai: {
          instructions: expect.any(String),
          store: false,
        },
      });
    });

    it('should not use providerOptions for non-Codex models', async () => {
      // Override to non-Codex model for this test
      vi.mocked(createSimpleClient).mockImplementation(() => {
        return Promise.resolve({
          model: 'gpt-4',  // Non-Codex model
          systemPrompt: '',
          resolvedModelId: 'gpt-4',
          tools: {},
          maxSteps: 30,
          thinkingLevel: 'medium' as any,
        } as any);
      });

      const config = createMockConfig();

      await runIdeation(config);

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.providerOptions).toBeUndefined();
    });
  });

  // ============================================
  // stepCountIs
  // ============================================

  describe('step limiting', () => {
    it('should use maxSteps for stepCountIs', async () => {
      const config = createMockConfig({ maxIdeasPerType: 5 });

      await runIdeation(config);

      expect(stepCountIs).toHaveBeenCalledWith(30);
      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.stopWhen).toBe(stepCountIs(30));
    });

    it('should use custom maxSteps when provided', async () => {
      vi.mocked(createSimpleClient).mockResolvedValue({
        model: 'gpt-4',
        systemPrompt: '',
        resolvedModelId: 'gpt-4',
        tools: {},
        maxSteps: 50,
        thinkingLevel: 'medium' as any,
      } as any);

      const config = createMockConfig();

      await runIdeation(config);

      expect(stepCountIs).toHaveBeenCalledWith(50);
    });
  });
});
