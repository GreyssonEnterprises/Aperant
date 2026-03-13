/**
 * Insights Runner Tests
 *
 * Tests for AI-powered codebase insights chat.
 * Covers conversation history, project context loading, streaming events, and task suggestion extraction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  runInsightsQuery,
  type InsightsConfig,
  type InsightsMessage,
} from '../insights';
import type { ThinkingLevel } from '../../config/types';

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
    readdirSync: vi.fn(),
  };
});

vi.mock('../../tools/build-registry', () => ({
  buildToolRegistry: vi.fn(),
}));

vi.mock('../prompts/prompt-loader', () => ({
  tryLoadPrompt: vi.fn(() => null),
}));

import { createSimpleClient } from '../../client/factory';
import { streamText, stepCountIs } from 'ai';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { buildToolRegistry } from '../../tools/build-registry';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<InsightsConfig>,
): InsightsConfig => ({
  projectDir: '/test/project',
  message: 'What is this codebase about?',
  ...overrides,
});

const createMockClientResult = () => ({
  model: 'gpt-4',
  systemPrompt: 'You are an AI assistant.',
  resolvedModelId: 'gpt-4',
  tools: {},
  maxSteps: 30,
  thinkingLevel: 'medium' as ThinkingLevel,
}) as any;

// ============================================
// Shared Helpers
// ============================================

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

// ============================================
// Setup & Teardown
// ============================================

describe('Insights Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue(createMockClientResult());

    // Mock streamText
    const createMockStreamResult = () => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Hello' };
        yield { type: 'text-delta', text: ' World' };
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

    vi.mocked(streamText).mockReturnValue(createMockStreamResult());
    vi.mocked(stepCountIs).mockReturnValue({} as any);

    // Mock fs.existsSync - return false by default
    vi.mocked(existsSync).mockReturnValue(false);

    // Mock buildToolRegistry
    vi.mocked(buildToolRegistry).mockReturnValue({
      getToolsForAgent: vi.fn(() => ({})),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // runInsightsQuery - basic
  // ============================================

  describe('runInsightsQuery', () => {
    it('should run insights query and return result', async () => {
      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.text).toBeTruthy();
      expect(result.taskSuggestion).toBeNull();
      expect(result.toolCalls).toEqual([]);
    });

    it('should use default model and thinking level', async () => {
      const config = createMockConfig();

      await runInsightsQuery(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should use provided model and thinking level', async () => {
      const config = createMockConfig({
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
      });

      await runInsightsQuery(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'haiku',
        thinkingLevel: 'low',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should include conversation history in prompt', async () => {
      const history: InsightsMessage[] = [
        { role: 'user', content: 'What is this?' },
        { role: 'assistant', content: 'It is a codebase.' },
      ];
      const config = createMockConfig({ history });

      await runInsightsQuery(config);

      const prompt = vi.mocked(streamText).mock.calls[0][0].prompt;
      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('User: What is this?');
      expect(prompt).toContain('Assistant: It is a codebase.');
      expect(prompt).toContain('Current question: What is this codebase about?');
    });

    it('should work without history', async () => {
      const config = createMockConfig({ history: [] });

      await runInsightsQuery(config);

      const prompt = vi.mocked(streamText).mock.calls[0][0].prompt;
      expect(prompt).not.toContain('Previous conversation:');
    });
  });

  // ============================================
  // runInsightsQuery - project context
  // ============================================

  describe('project context loading', () => {
    it('should load project index if available', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('project_index.json');
      });
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        project_root: '/test',
        project_type: 'web-app',
        services: { api: {}, frontend: {} },
        infrastructure: { database: 'postgres' },
      }));

      const config = createMockConfig();

      await runInsightsQuery(config);

      const systemPrompt = vi.mocked(createSimpleClient).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('## Project Structure');
      expect(systemPrompt).toContain('web-app');
    });

    it('should load roadmap features if available', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('roadmap.json');
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            features: [
            { title: 'Feature 1', status: 'planned' },
            { title: 'Feature 2', status: 'in_progress' },
          ],
          });
        }
        return '';
      });

      const config = createMockConfig();

      await runInsightsQuery(config);

      const systemPrompt = vi.mocked(createSimpleClient).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('## Roadmap Features');
    });

    it('should list existing tasks if specs directory exists', async () => {
      // Mock existsSync to return true only for the specs directory
      const specsPath = join('.auto-claude', 'specs');
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes(specsPath) || pathStr.includes('.auto-claude/specs');
      });
      // Mock readdirSync to return Dirent-like objects
      const mockDirents = [
        { name: '001-task1', isDirectory: () => true },
        { name: '002-task2', isDirectory: () => true },
      ] as any;
      vi.mocked(readdirSync).mockReturnValue(mockDirents);

      const config = createMockConfig();

      await runInsightsQuery(config);

      const systemPrompt = vi.mocked(createSimpleClient).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('## Existing Tasks/Specs');
      expect(systemPrompt).toContain('001-task1');
      expect(systemPrompt).toContain('002-task2');
    });
  });

  // ============================================
  // runInsightsQuery - streaming events
  // ============================================

  describe('streaming events', () => {
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

      await runInsightsQuery(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'text-delta', text: 'Hello' });
      expect(onStream).toHaveBeenCalledWith({ type: 'text-delta', text: ' World' });
    });

    it('should call onStream for tool-start events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'tool-call', toolName: 'Read', toolCallId: '1', input: { file_path: '/test/file.ts' } },
        ])
      );

      const config = createMockConfig();

      await runInsightsQuery(config, onStream);

      expect(onStream).toHaveBeenCalledWith({
        type: 'tool-start',
        name: 'Read',
        input: expect.any(String),
      });
    });

    it('should call onStream for tool-end events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'tool-result', toolName: 'Read', toolCallId: '1' },
        ])
      );

      const config = createMockConfig();

      await runInsightsQuery(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'tool-end', name: 'Read' });
    });

    it('should call onStream for error events', async () => {
      const events: any[] = [];
      const onStream = vi.fn((event) => events.push(event));

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([{ type: 'error', error: 'Something failed' }])
      );

      const config = createMockConfig();

      await runInsightsQuery(config, onStream);

      expect(onStream).toHaveBeenCalledWith({ type: 'error', error: 'Something failed' });
    });

    it('should work without onStream callback', async () => {
      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.text).toBeTruthy();
    });
  });

  // ============================================
  // runInsightsQuery - task suggestion extraction
  // ============================================

  describe('task suggestion extraction', () => {
    it('should extract task suggestion from response', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          {
            type: 'text-delta',
            text: '__TASK_SUGGESTION__:{"title":"Add auth","description":"Implement login","metadata":{"category":"feature","complexity":"medium","impact":"high"}}',
          },
        ])
      );

      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.taskSuggestion).toEqual({
        title: 'Add auth',
        description: 'Implement login',
        metadata: {
          category: 'feature',
          complexity: 'medium',
          impact: 'high',
        },
      });
    });

    it('should return null task suggestion when not found', async () => {
      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.taskSuggestion).toBeNull();
    });

    it('should include taskSuggestion in result', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          {
            type: 'text-delta',
            text: '__TASK_SUGGESTION__:{"title":"Fix bug","description":"Fix crash","metadata":{"category":"bug_fix","complexity":"small","impact":"medium"}}',
          },
        ])
      );

      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.taskSuggestion).not.toBeNull();
      expect(result.taskSuggestion?.title).toBe('Fix bug');
    });
  });

  // ============================================
  // runInsightsQuery - error handling
  // ============================================

  describe('error handling', () => {
    it('should propagate errors from streaming', async () => {
      vi.mocked(streamText).mockImplementation(() => {
        const errorStream = (async function* () {
          yield { type: 'text-delta', text: 'Partial' };
          throw new Error('API error');
        })();
        return {
          fullStream: errorStream,
          text: '',
          content: '',
          reasoning: '',
          reasoningText: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finish: () => Promise.resolve(),
          toDataStream: () => new ReadableStream(),
          toResponse: () => new Response(),
        } as any;
      });

      const config = createMockConfig();

      await expect(runInsightsQuery(config)).rejects.toThrow('API error');
    });

    it('should track tool calls made during session', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'tool-call', toolName: 'Read', toolCallId: '1', input: { file_path: '/test/file.ts' } },
          { type: 'tool-result', toolName: 'Read', toolCallId: '1' },
        ])
      );

      const config = createMockConfig();

      const result = await runInsightsQuery(config);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('Read');
    });
  });

  // ============================================
  // runInsightsQuery - abort signal
  // ============================================

  describe('abort signal', () => {
    it('should pass abortSignal to streamText', async () => {
      const abortController = new AbortController();

      const config = createMockConfig({ abortSignal: abortController.signal });

      await runInsightsQuery(config);

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.abortSignal).toBe(abortController.signal);
    });
  });
});
