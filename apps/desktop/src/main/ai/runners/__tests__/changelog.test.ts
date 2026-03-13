/**
 * Changelog Runner Tests
 *
 * Tests for AI-powered changelog generation.
 * Covers changelog generation for different source modes, prompt building, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateChangelog,
  type ChangelogConfig,
  type ChangelogTask,
} from '../changelog';

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
  overrides?: Partial<ChangelogConfig>,
): ChangelogConfig => ({
  projectName: 'TestProject',
  version: '1.2.0',
  sourceMode: 'tasks',
  ...overrides,
});

const createMockTask = (
  overrides?: Partial<ChangelogTask>,
): ChangelogTask => ({
  title: 'Add user authentication',
  description: 'Implemented OAuth2 login flow',
  category: 'feature',
  issueNumber: 42,
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('Changelog Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue({
      model: 'gpt-4',
      systemPrompt: 'You are a technical writer.',
      resolvedModelId: 'gpt-4',
      tools: {},
      maxSteps: 100,
      thinkingLevel: 'low' as any,
    } as any);

    // Mock generateText
    vi.mocked(generateText).mockResolvedValue({
      text: '## Added\n- New feature',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // generateChangelog - tasks mode
  // ============================================

  describe('generateChangelog - tasks mode', () => {
    it('should generate changelog from tasks', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '## Added\n- Add dark mode\n\n## Fixed\n- Fix login bug',
      } as any);

      const config = createMockConfig({
        sourceMode: 'tasks',
        tasks: [
          createMockTask({ title: 'Add dark mode', category: 'feature' }),
          createMockTask({ title: 'Fix login bug', category: 'bug_fix' }),
        ],
      });

      const result = await generateChangelog(config);

      expect(result.success).toBe(true);
      expect(result.text).toContain('Add dark mode');
      expect(result.text).toContain('Fix login bug');
      expect(result.error).toBeUndefined();
    });

    it('should include task metadata in prompt', async () => {
      const config = createMockConfig({
        sourceMode: 'tasks',
        tasks: [
          createMockTask({
            title: 'OAuth2 Login',
            category: 'feature',
            issueNumber: 123,
          }),
        ],
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('OAuth2 Login');
      expect(prompt).toContain('[feature]');
      expect(prompt).toContain('(#123)');
    });

    it('should handle tasks without category', async () => {
      const config = createMockConfig({
        sourceMode: 'tasks',
        tasks: [createMockTask({ title: 'Update docs', category: undefined })],
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('Update docs');
    });

    it('should handle tasks without issue number', async () => {
      const config = createMockConfig({
        sourceMode: 'tasks',
        tasks: [createMockTask({ issueNumber: undefined })],
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).not.toContain('(#');
    });

    it('should handle empty tasks array', async () => {
      const config = createMockConfig({
        sourceMode: 'tasks',
        tasks: [],
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('TestProject');
      expect(prompt).toContain('1.2.0');
    });
  });

  // ============================================
  // generateChangelog - git-history mode
  // ============================================

  describe('generateChangelog - git-history mode', () => {
    it('should generate changelog from git history', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '## Added\n- Feature A\n\n## Fixed\n- Bug B',
      } as any);

      const config = createMockConfig({
        sourceMode: 'git-history',
        commits: 'feat: add feature A\nfix: fix bug B\n',
      });

      const result = await generateChangelog(config);

      expect(result.success).toBe(true);
      expect(result.text).toContain('Feature A');
      expect(result.text).toContain('Bug B');
    });

    it('should truncate long commit messages', async () => {
      const longCommits = 'x'.repeat(6000);
      const config = createMockConfig({
        sourceMode: 'git-history',
        commits: longCommits,
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt.length).toBeLessThan(6000);
    });
  });

  // ============================================
  // generateChangelog - branch-diff mode
  // ============================================

  describe('generateChangelog - branch-diff mode', () => {
    it('should generate changelog from branch diff', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '## Added\n- New feature',
      } as any);

      const config = createMockConfig({
        sourceMode: 'branch-diff',
        commits: 'diff output',
      });

      const result = await generateChangelog(config);

      expect(result.success).toBe(true);
      expect(result.text).toContain('New feature');
    });

    it('should include "Branch Diff" in prompt', async () => {
      const config = createMockConfig({
        sourceMode: 'branch-diff',
        commits: 'commits',
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('Branch Diff');
    });
  });

  // ============================================
  // generateChangelog - previous changelog
  // ============================================

  describe('generateChangelog - previous changelog', () => {
    it('should include previous changelog in prompt', async () => {
      const previousChangelog = '## 1.1.0\n- Old feature';
      const config = createMockConfig({
        previousChangelog,
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('Previous Changelog');
      expect(prompt).toContain('Old feature');
    });

    it('should truncate long previous changelog', async () => {
      const longChangelog = '## 1.1.0\n' + 'x'.repeat(3000);
      const config = createMockConfig({
        previousChangelog: longChangelog,
      });

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt.length).toBeLessThan(3000);
    });
  });

  // ============================================
  // generateChangelog - model and thinking
  // ============================================

  describe('generateChangelog - model and thinking', () => {
    it('should use default model and thinking level', async () => {
      const config = createMockConfig();

      await generateChangelog(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'sonnet',
        thinkingLevel: 'low',
      });
    });

    it('should use provided model and thinking level', async () => {
      const config = createMockConfig({
        modelShorthand: 'haiku',
        thinkingLevel: 'medium',
      });

      await generateChangelog(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'haiku',
        thinkingLevel: 'medium',
      });
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should handle empty AI response', async () => {
      vi.mocked(generateText).mockResolvedValue({ text: '   ' } as any);

      const config = createMockConfig();
      const result = await generateChangelog(config);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.error).toBe('Empty response from AI');
    });

    it('should handle AI generation errors', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));

      const config = createMockConfig();
      const result = await generateChangelog(config);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.error).toBe('API error');
    });

    it('should handle non-Error objects', async () => {
      vi.mocked(generateText).mockRejectedValue('String error');

      const config = createMockConfig();
      const result = await generateChangelog(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should trim whitespace from generated text', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '  \n  ## Changelog  \n  ',
      } as any);

      const config = createMockConfig();
      const result = await generateChangelog(config);

      expect(result.success).toBe(true);
      expect(result.text).toBe('## Changelog');
    });
  });

  // ============================================
  // System Prompt
  // ============================================

  describe('system prompt', () => {
    it('should use technical writer system prompt', async () => {
      const config = createMockConfig();

      await generateChangelog(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('technical writer'),
        modelShorthand: 'sonnet',
        thinkingLevel: 'low',
      });
    });

    it('should include Keep a Changelog format in prompt', async () => {
      const config = createMockConfig();

      await generateChangelog(config);

      const clientCall = vi.mocked(createSimpleClient).mock.calls[0];
      expect(clientCall[0].systemPrompt).toContain('Keep a Changelog');
    });
  });

  // ============================================
  // Prompt Building
  // ============================================

  describe('prompt building', () => {
    it('should include project name and version in prompt', async () => {
      const config: ChangelogConfig = {
        projectName: 'MyProject',
        version: '2.0.0',
        sourceMode: 'tasks',
      };

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('MyProject');
      expect(prompt).toContain('2.0.0');
    });

    it('should include output instructions in prompt', async () => {
      const config = createMockConfig();

      await generateChangelog(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('ONLY the changelog entry markdown');
    });
  });
});
