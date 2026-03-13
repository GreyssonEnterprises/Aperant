import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

const mockCreateSimpleClient = vi.fn();

vi.mock('../../client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

// Mock filesystem access so tests are hermetic
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

// json-repair is used by the commit-message runner for safeParseJson
vi.mock('../../../utils/json-repair', () => ({
  safeParseJson: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
}));

// =============================================================================
// Import after mocking
// =============================================================================

import { generateCommitMessage } from '../commit-message';
import type { CommitMessageConfig } from '../commit-message';

// =============================================================================
// Helpers
// =============================================================================

const fakeModel = { modelId: 'claude-haiku-test' };

function makeMockClient(systemPrompt = 'You are a Git expert.') {
  return { model: fakeModel, systemPrompt };
}

function baseConfig(overrides: Partial<CommitMessageConfig> = {}): CommitMessageConfig {
  return {
    projectDir: '/project',
    specName: '001-add-feature',
    diffSummary: '+5 -2 src/app.ts',
    filesChanged: ['src/app.ts', 'src/utils.ts'],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('generateCommitMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSimpleClient.mockResolvedValue(makeMockClient());
    // By default, spec directory does not exist
    mockExistsSync.mockReturnValue(false);
  });

  // ---------------------------------------------------------------------------
  // Successful generation
  // ---------------------------------------------------------------------------

  it('returns trimmed AI-generated commit message on success', async () => {
    mockGenerateText.mockResolvedValue({
      text: '  feat(app): add authentication flow\n\nImplemented OAuth2.\n  ',
    });

    const result = await generateCommitMessage(baseConfig());

    expect(result).toBe('feat(app): add authentication flow\n\nImplemented OAuth2.');
  });

  it('passes model and systemPrompt from client to generateText', async () => {
    mockGenerateText.mockResolvedValue({ text: 'feat: something' });

    await generateCommitMessage(baseConfig());

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.model).toBe(fakeModel);
    expect(callArgs.system).toBe('You are a Git expert.');
  });

  it('includes diffSummary in the prompt sent to generateText', async () => {
    mockGenerateText.mockResolvedValue({ text: 'fix: resolve bug' });

    await generateCommitMessage(baseConfig({ diffSummary: 'removed null check in auth.ts' }));

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('removed null check in auth.ts');
  });

  it('includes filesChanged in the prompt', async () => {
    mockGenerateText.mockResolvedValue({ text: 'refactor: split utilities' });

    await generateCommitMessage(
      baseConfig({ filesChanged: ['src/auth.ts', 'src/utils.ts', 'src/index.ts'] }),
    );

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('src/auth.ts');
  });

  // ---------------------------------------------------------------------------
  // Default model / thinking level
  // ---------------------------------------------------------------------------

  it('uses haiku model and low thinking level by default', async () => {
    mockGenerateText.mockResolvedValue({ text: 'chore: update deps' });

    await generateCommitMessage(baseConfig());

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('haiku');
    expect(clientArgs.thinkingLevel).toBe('low');
  });

  it('accepts custom modelShorthand and thinkingLevel', async () => {
    mockGenerateText.mockResolvedValue({ text: 'feat: new endpoint' });

    await generateCommitMessage(baseConfig({ modelShorthand: 'sonnet', thinkingLevel: 'medium' }));

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('sonnet');
    expect(clientArgs.thinkingLevel).toBe('medium');
  });

  // ---------------------------------------------------------------------------
  // GitHub issue handling
  // ---------------------------------------------------------------------------

  it('includes Fixes reference when githubIssue is provided', async () => {
    mockGenerateText.mockResolvedValue({ text: 'fix: null pointer\n\nFixes #99' });

    const result = await generateCommitMessage(baseConfig({ githubIssue: 99 }));

    expect(result).toContain('Fixes #99');
  });

  // ---------------------------------------------------------------------------
  // Spec file context
  // ---------------------------------------------------------------------------

  it('reads spec.md for title when spec directory exists', async () => {
    // Spec directory at .auto-claude/specs/001-add-feature
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Add OAuth Feature\n\n## Overview\nFull OAuth2 support.';
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat(auth): add OAuth2' });

    const result = await generateCommitMessage(baseConfig());

    // Result should come from LLM (title from spec was available for context)
    expect(result).toBe('feat(auth): add OAuth2');
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Add OAuth Feature');
  });

  // ---------------------------------------------------------------------------
  // Fallback message
  // ---------------------------------------------------------------------------

  it('returns fallback message when generateText throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('Network error'));

    const result = await generateCommitMessage(baseConfig({ specName: '001-add-feature' }));

    // Fallback format: "<type>: <title or specName>"
    expect(result).toMatch(/^(feat|fix|refactor|docs|test|perf|chore|style|ci|build):/);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes Fixes in fallback when githubIssue provided and LLM fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('Timeout'));

    const result = await generateCommitMessage(baseConfig({ githubIssue: 77 }));

    expect(result).toContain('Fixes #77');
  });

  it('returns fallback when LLM returns empty text', async () => {
    mockGenerateText.mockResolvedValue({ text: '   ' });

    const result = await generateCommitMessage(baseConfig());

    // Should fall through to fallback
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Large filesChanged list
  // ---------------------------------------------------------------------------

  it('truncates filesChanged list when more than 20 files', async () => {
    mockGenerateText.mockResolvedValue({ text: 'refactor: big cleanup' });

    const manyFiles = Array.from({ length: 30 }, (_, i) => `src/file${i}.ts`);
    await generateCommitMessage(baseConfig({ filesChanged: manyFiles }));

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('and 10 more files');
  });

  // ---------------------------------------------------------------------------
  // Spec context from requirements.json (lines 141, 144)
  // ---------------------------------------------------------------------------

  it('reads workflow_type from requirements.json to determine commit type', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Some Feature\n\n## Overview\nDescription here.';
      if (p.includes('requirements.json')) return JSON.stringify({
        feature: 'Add logging',
        workflow_type: 'bug_fix',
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'fix: resolve logging issue' });

    const result = await generateCommitMessage(baseConfig());

    expect(result).toBe('fix: resolve logging issue');
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Type: fix');
  });

  it('reads task_description from requirements.json when no overview in spec.md', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Feature\n\nNo overview section here.'; // No Overview section
      if (p.includes('requirements.json')) return JSON.stringify({
        feature: 'Add caching',
        workflow_type: 'feature',
        task_description: 'Implement Redis-based caching layer for API responses to improve performance',
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: add caching' });

    await generateCommitMessage(baseConfig());

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Description: Implement Redis-based caching layer');
  });

  it('uses feature from requirements.json as title when spec.md has no title', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return 'No header here'; // No # title
      if (p.includes('requirements.json')) return JSON.stringify({
        feature: 'Add payment processing',
        workflow_type: 'feature',
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: add payment processing' });

    await generateCommitMessage(baseConfig());

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Task: Add payment processing');
  });

  // ---------------------------------------------------------------------------
  // Spec context from implementation_plan.json (lines 156, 159)
  // ---------------------------------------------------------------------------

  it('reads githubIssueNumber from implementation_plan.json', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Feature';
      if (p.includes('implementation_plan.json')) return JSON.stringify({
        metadata: {
          githubIssueNumber: 42,
        },
        feature: 'Issue linked feature',
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: add feature\n\nFixes #42' });

    const result = await generateCommitMessage(baseConfig());

    expect(result).toContain('Fixes #42');
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('GitHub Issue: #42');
  });

  it('reads title from implementation_plan.json when spec.md and requirements.json have no title', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return 'No title here';
      if (p.includes('requirements.json')) return JSON.stringify({
        workflow_type: 'feature',
        // No feature field
      });
      if (p.includes('implementation_plan.json')) return JSON.stringify({
        feature: 'Title from plan',
        metadata: {},
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: title from plan' });

    await generateCommitMessage(baseConfig());

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Task: Title from plan');
  });

  it('reads title field from implementation_plan.json as fallback', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return 'No title';
      if (p.includes('requirements.json')) return JSON.stringify({
        workflow_type: 'feature',
      });
      if (p.includes('implementation_plan.json')) return JSON.stringify({
        title: 'Title using title field',
        metadata: {},
      });
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: title field' });

    await generateCommitMessage(baseConfig());

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Task: Title using title field');
  });

  // ---------------------------------------------------------------------------
  // Spec directory not found (auto-claude path fallback)
  // ---------------------------------------------------------------------------

  it('tries auto-claude path when .auto-claude path does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      // .auto-claude path doesn't exist, auto-claude does
      if (normalized.includes('.auto-claude/specs')) return false;
      if (normalized.includes('auto-claude/specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Alternative Path Feature';
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: alternative path' });

    await generateCommitMessage(baseConfig());

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Task: Alternative Path Feature');
  });

  // ---------------------------------------------------------------------------
  // Error handling in spec file reading
  // ---------------------------------------------------------------------------

  it('handles read errors gracefully when reading spec files', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) {
        throw new Error('Permission denied');
      }
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'chore: 001-add-feature' });

    const result = await generateCommitMessage(baseConfig());

    // Should fall back to specName as title
    expect(result).toBe('chore: 001-add-feature');
  });

  it('handles invalid JSON in requirements.json gracefully', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      if (normalized.includes('specs/001-add-feature')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('spec.md')) return '# Feature';
      if (p.includes('requirements.json')) return 'invalid json {{{';
      return '{}';
    });
    mockGenerateText.mockResolvedValue({ text: 'feat: feature' });

    const result = await generateCommitMessage(baseConfig());

    expect(result).toBe('feat: feature');
  });
});
