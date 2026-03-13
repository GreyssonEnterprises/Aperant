/**
 * Commit Message Runner Tests
 *
 * Tests for AI-powered commit message generation.
 * Covers conventional commits, GitHub issue references, spec context extraction, and fallback messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { generateCommitMessage, type CommitMessageConfig } from '../commit-message';

// Mock all dependencies
vi.mock('../../client/factory', () => ({
  createSimpleClient: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
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
import { generateText } from 'ai';
import { existsSync, readFileSync } from 'node:fs';

// ============================================
// Test Fixtures
// ============================================

const createMockConfig = (
  overrides?: Partial<CommitMessageConfig>,
): CommitMessageConfig => ({
  projectDir: '/test/project',
  specName: '001-add-feature',
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('Commit Message Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue({
      model: 'gpt-4',
      systemPrompt: 'You are a Git expert.',
      resolvedModelId: 'gpt-4',
      tools: {},
      maxSteps: 1,
      thinkingLevel: 'low' as any,
    } as any);

    // Mock generateText
    vi.mocked(generateText).mockResolvedValue({
      text: 'feat: add OAuth2 authentication\n\nImplemented OAuth2 with Google and GitHub.',
    } as any);

    // Mock fs.existsSync to return false by default (no spec files)
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // generateCommitMessage - basic
  // ============================================

  describe('generateCommitMessage', () => {
    it('should generate a commit message using AI', async () => {
      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toContain('feat:');
      expect(result).toContain('OAuth2');
    });

    it('should use default model and thinking level', async () => {
      const config = createMockConfig();

      await generateCommitMessage(config);

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

      await generateCommitMessage(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: expect.any(String),
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
      });
    });
  });

  // ============================================
  // generateCommitMessage - spec context
  // ============================================

  describe('spec context extraction', () => {
    it('should read spec.md for title', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        // Return true for spec directory and spec.md file
        return pathStr.includes('.auto-claude/specs/001-add-feature') || pathStr.includes('spec.md');
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('spec.md')) {
          return '# Add User Authentication\n\nImplement login flow.';
        }
        return '';
      });

      const config = createMockConfig();

      await generateCommitMessage(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('Add User Authentication');
    });

    it('should read requirements.json for category', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('requirements.json')) {
          return JSON.stringify({ workflow_type: 'feature' });
        }
        return '';
      });

      const config = createMockConfig();

      await generateCommitMessage(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('Type: feat');
    });

    it('should try both spec directory locations', async () => {
      const existsCalls: string[] = [];
      vi.mocked(existsSync).mockImplementation((path) => {
        existsCalls.push(String(path));
        return false;
      });

      const config = createMockConfig();

      await generateCommitMessage(config);

      expect(existsCalls).toContain(join('/test/project', '.auto-claude', 'specs', '001-add-feature'));
      expect(existsCalls).toContain(join('/test/project', 'auto-claude', 'specs', '001-add-feature'));
    });
  });

  // ============================================
  // generateCommitMessage - GitHub issue
  // ============================================

  describe('GitHub issue handling', () => {
    it('should include GitHub issue number when provided', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'feat: add feature\n\nFixes #42',
      } as any);

      const config = createMockConfig({ githubIssue: 42 });

      const result = await generateCommitMessage(config);

      expect(result).toContain('Fixes #42');
    });

    it('should prefer provided issue over spec metadata', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('implementation_plan.json')) {
          return JSON.stringify({
            metadata: { githubIssueNumber: 99 },
          });
        }
        return '';
      });

      vi.mocked(generateText).mockResolvedValue({
        text: 'feat: feature\n\nFixes #123',
      } as any);

      const config = createMockConfig({ githubIssue: 123 });

      const result = await generateCommitMessage(config);

      expect(result).toContain('Fixes #123');
      expect(result).not.toContain('#99');
    });

    it('should use spec issue when githubIssue not provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('implementation_plan.json')) {
          return JSON.stringify({
            metadata: { githubIssueNumber: 42 },
          });
        }
        return '';
      });

      vi.mocked(generateText).mockResolvedValue({
        text: 'feat: feature\n\nFixes #42',
      } as any);

      const config = createMockConfig(); // No githubIssue provided

      const result = await generateCommitMessage(config);

      expect(result).toContain('Fixes #42');
    });
  });

  // ============================================
  // generateCommitMessage - diff summary
  // ============================================

  describe('diff summary handling', () => {
    it('should include diff summary in prompt', async () => {
      const config = createMockConfig({
        diffSummary: '+ addFeature()',
        filesChanged: ['src/auth.ts'],
      });

      await generateCommitMessage(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('+ addFeature()');
      expect(prompt).toContain('Files changed: 1');
    });

    it('should truncate large diff summary', async () => {
      const largeDiff = 'x'.repeat(3000);
      const config = createMockConfig({
        diffSummary: largeDiff,
      });

      await generateCommitMessage(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      // Prompt includes preamble text, but truncated diff means total should be < 3000
      expect(prompt.length).toBeLessThan(3000);
      expect(prompt.length).toBeGreaterThan(2000); // preamble + truncated diff
    });

    it('should handle many changed files', async () => {
      const files = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`);
      const config = createMockConfig({
        filesChanged: files,
      });

      await generateCommitMessage(config);

      const prompt = vi.mocked(generateText).mock.calls[0]?.[0]?.prompt ?? '';
      expect(prompt).toContain('... and 5 more files');
      expect(prompt).not.toContain('src/file24.ts');
    });
  });

  // ============================================
  // generateCommitMessage - fallback
  // ============================================

  describe('fallback message', () => {
    it('should return fallback message on AI failure', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toContain('chore:');
      expect(result).toContain('001-add-feature');
    });

    it('should include issue number in fallback', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));

      const config = createMockConfig({ githubIssue: 42 });

      const result = await generateCommitMessage(config);

      expect(result).toContain('Fixes #42');
    });

    it('should use category from spec in fallback', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('API error'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('requirements.json')) {
          return JSON.stringify({ workflow_type: 'bug_fix' });
        }
        return '';
      });

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toMatch(/fix:\s*\S+/i);
    });
  });

  // ============================================
  // generateCommitMessage - error handling
  // ============================================

  describe('error handling', () => {
    it('should handle non-Error objects in catch', async () => {
      vi.mocked(generateText).mockRejectedValue('String error');

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toContain('chore:'); // Falls back to default
    });

    it('should return non-empty string even on complete failure', async () => {
      vi.mocked(createSimpleClient).mockRejectedValue(new Error('Client error'));
      vi.mocked(existsSync).mockReturnValue(false);

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Category mapping
  // ============================================

  describe('category to commit type mapping', () => {
    const categories: Array<{ workflow_type: string; expected: string }> = [
      { workflow_type: 'feature', expected: 'feat' },
      { workflow_type: 'bug_fix', expected: 'fix' },
      { workflow_type: 'bug', expected: 'fix' },
      { workflow_type: 'refactoring', expected: 'refactor' },
      { workflow_type: 'documentation', expected: 'docs' },
      { workflow_type: 'docs', expected: 'docs' },
      { workflow_type: 'testing', expected: 'test' },
      { workflow_type: 'performance', expected: 'perf' },
      { workflow_type: 'security', expected: 'security' },
      { workflow_type: 'chore', expected: 'chore' },
    ];

    it.each(categories)('should map $workflow_type to $expected', async ({ workflow_type, expected }) => {
      vi.mocked(generateText).mockRejectedValue(new Error('AI error'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('requirements.json')) {
          return JSON.stringify({ workflow_type });
        }
        return '';
      });

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toMatch(new RegExp(`^${expected}:`, 'm'));
    });

    it('should default to "chore" for unknown category', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('AI error'));
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('requirements.json')) {
          return JSON.stringify({ workflow_type: 'unknown_type' });
        }
        return '';
      });

      const config = createMockConfig();

      const result = await generateCommitMessage(config);

      expect(result).toMatch(/^chore:/);
    });
  });
});
