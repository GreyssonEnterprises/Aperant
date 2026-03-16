/**
 * Mock Factories for PR Review Tests
 * ==================================
 *
 * Factory functions to create test data objects with sensible defaults.
 * Follows the builder pattern for flexible test setup.
 */

import type { Project } from '../../shared/types/project';
import type { GitHubConfig } from '../../main/ipc-handlers/github/types';
import type { PRContext, PRReviewFinding, ChangedFile, AIBotComment } from '../../main/ai/runners/github/pr-review-engine';
import type { PRReviewResult, PRReviewProgress } from '../../preload/api/modules/github-api';

/**
 * Create mock Project with GitHub configuration
 *
 * @param overrides - Optional property overrides
 * @returns Mock Project object
 *
 * @example
 * ```ts
 * const project = createMockProject({
 *   name: 'test-project',
 *   path: '/tmp/test'
 * });
 * ```
 */
export function createMockProject(overrides: Partial<Project> = {}): Project {
  const now = new Date();
  return {
    id: 'project-test-id',
    name: 'Test Project',
    path: '/tmp/test-project',
    autoBuildPath: '/tmp/test-project/.auto-claude',
    settings: {
      model: 'claude-3-5-sonnet-20241022',
      memoryBackend: 'file',
      linearSync: false,
      notifications: {
        onTaskComplete: true,
        onTaskFailed: true,
        onReviewNeeded: true,
        sound: false
      }
    },
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

/**
 * Create mock GitHub configuration
 *
 * @param token - GitHub personal access token
 * @param repo - Repository in 'owner/repo' format
 * @param overrides - Optional property overrides
 * @returns Mock GitHubConfig object
 *
 * @example
 * ```ts
 * const config = createMockGitHubConfig('ghp_123', 'owner/repo');
 * ```
 */
export function createMockGitHubConfig(
  token: string = 'ghp_test_token',
  repo: string = 'owner/repo',
  overrides: Partial<GitHubConfig> = {}
): GitHubConfig {
  return {
    token,
    repo,
    ...overrides
  };
}

/**
 * Create mock PR context with defaults
 *
 * @param overrides - Optional property overrides
 * @returns Mock PRContext object
 *
 * @example
 * ```ts
 * const context = createMockPRContext({
 *   prNumber: 42,
 *   title: 'Fix bug'
 * });
 * ```
 */
export function createMockPRContext(overrides: Partial<PRContext> = {}): PRContext {
  return {
    prNumber: 42,
    title: 'Test PR',
    description: 'Test PR description',
    author: 'testuser',
    baseBranch: 'develop',
    headBranch: 'feature/test',
    state: 'open',
    changedFiles: [
      {
        path: 'src/test.ts',
        additions: 10,
        deletions: 5,
        status: 'modified'
      }
    ] as ChangedFile[],
    diff: 'diff --git a/src/test.ts b/src/test.ts\n+new line',
    diffTruncated: false,
    repoStructure: 'src/\n└── test.ts',
    relatedFiles: [],
    commits: [
      {
        oid: 'abc123',
        messageHeadline: 'Test commit',
        committedDate: new Date().toISOString()
      }
    ],
    labels: [],
    totalAdditions: 10,
    totalDeletions: 5,
    aiBotComments: [],
    ...overrides
  };
}

/**
 * Create mock review finding
 *
 * @param overrides - Optional property overrides
 * @returns Mock PRReviewFinding object
 *
 * @example
 * ```ts
 * const finding = createMockFinding({
 *   severity: 'critical',
 *   category: 'security'
 * });
 * ```
 */
export function createMockFinding(overrides: Partial<PRReviewFinding> = {}): PRReviewFinding {
  return {
    id: 'TEST-001',
    severity: 'medium',
    category: 'quality' as const,
    title: 'Test Finding',
    description: 'This is a test finding',
    file: 'src/test.ts',
    line: 10,
    endLine: 15,
    suggestedFix: 'Fix the issue',
    fixable: true,
    evidence: 'const x = 1;',
    verificationNote: 'Verified manually',
    validationStatus: 'needs_human_review',
    validationExplanation: 'Needs review',
    sourceAgents: ['security-specialist'],
    crossValidated: false,
    ...overrides
  } as PRReviewFinding;
}

/**
 * Create mock review result
 *
 * @param overrides - Optional property overrides
 * @returns Mock PRReviewResult object
 *
 * @example
 * ```ts
 * const result = createMockReviewResult({
 *   prNumber: 42,
 *   overallStatus: 'approve'
 * });
 * ```
 */
export function createMockReviewResult(overrides: Partial<PRReviewResult> = {}): PRReviewResult {
  // createMockFinding returns a broader ReviewCategory type that includes 'verification_failed'
  // but the API type only accepts the narrower set. Since createMockFinding always returns
  // 'quality', we cast directly to the narrower type.
  const mockFinding = createMockFinding() as PRReviewResult['findings'][number];

  return {
    prNumber: 42,
    repo: 'test/repo',
    success: true,
    findings: [mockFinding],
    summary: 'LGTM, looks good to merge',
    overallStatus: 'approve',
    reviewedAt: new Date().toISOString(),
    error: undefined,
    ...overrides
  };
}

/**
 * Create mock review progress
 *
 * @param overrides - Optional property overrides
 * @returns Mock PRReviewProgress object
 *
 * @example
 * ```ts
 * const progress = createMockProgress({
 *   phase: 'analyzing',
 *   progress: 50
 * });
 * ```
 */
export function createMockProgress(overrides: Partial<PRReviewProgress> = {}): PRReviewProgress {
  return {
    phase: 'fetching',
    prNumber: 42,
    progress: 0,
    message: 'Starting review...',
    ...overrides
  };
}

/**
 * Create mock changed file
 *
 * @param path - File path
 * @param additions - Number of additions
 * @param deletions - Number of deletions
 * @param overrides - Optional property overrides
 * @returns Mock ChangedFile object
 *
 * @example
 * ```ts
 * const file = createMockChangedFile('src/test.ts', 10, 5);
 * ```
 */
export function createMockChangedFile(
  path: string = 'src/test.ts',
  additions: number = 10,
  deletions: number = 5,
  overrides: Partial<ChangedFile> = {}
): ChangedFile {
  return {
    path,
    additions,
    deletions,
    status: 'modified',
    patch: `@@ -1,1 +1,2 @@
-line 1
+line 1 modified`,
    ...overrides
  };
}

/**
 * Create mock AI bot comment
 *
 * @param toolName - Name of the AI tool
 * @param body - Comment body text
 * @param overrides - Optional property overrides
 * @returns Mock AIBotComment object
 *
 * @example
 * ```ts
 * const comment = createMockAIComment('CodeRabbit', 'Add error handling');
 * ```
 */
export function createMockAIComment(
  toolName: string = 'CodeRabbit',
  body: string = 'This looks good but could be improved',
  overrides: Partial<AIBotComment> = {}
): AIBotComment {
  return {
    commentId: 1,
    author: 'ai-bot',
    toolName,
    body,
    file: 'src/test.ts',
    line: 10,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create multiple mock findings with auto-incrementing IDs
 *
 * @param count - Number of findings to create
 * @param baseOverrides - Overrides to apply to all findings
 * @returns Array of mock PRReviewFinding objects
 *
 * @example
 * ```ts
 * const findings = createMockFindings(3, {
 *   severity: 'high',
 *   category: 'security'
 * });
 * // Creates TEST-001, TEST-002, TEST-003 all with high severity
 * ```
 */
export function createMockFindings(
  count: number,
  baseOverrides: Partial<PRReviewFinding> = {}
): PRReviewFinding[] {
  return Array.from({ length: count }, (_, i) =>
    createMockFinding({
      ...baseOverrides,
      id: `TEST-${String(i + 1).padStart(3, '0')}`,
      title: `${baseOverrides.title || 'Test Finding'} ${i + 1}`,
      line: 10 + i * 5
    })
  );
}

/**
 * Create mock scan result
 *
 * @param complexity - Complexity level
 * @param riskAreas - Array of risk area strings
 * @returns Mock scan result
 *
 * @example
 * ```ts
 * const scanResult = createMockScanResult('high', ['authentication', 'database']);
 * ```
 */
export interface MockScanResult {
  complexity: 'low' | 'medium' | 'high';
  riskAreas: string[];
  verdict?: string;
  summary?: string;
}

export function createMockScanResult(
  complexity: 'low' | 'medium' | 'high' = 'medium',
  riskAreas: string[] = [],
  overrides: Partial<MockScanResult> = {}
): MockScanResult {
  return {
    complexity,
    riskAreas,
    verdict: 'needs_review',
    summary: 'PR requires review',
    ...overrides
  };
}

/**
 * Builder for creating complex PR contexts
 *
 * Provides a fluent interface for building PR contexts.
 *
 * @example
 * ```ts
 * const context = new PRContextBuilder()
 *   .withPrNumber(42)
 *   .withFiles([
 *     createMockChangedFile('src/a.ts', 10, 0),
 *     createMockChangedFile('src/b.ts', 20, 5)
 *   ])
 *   .withLabels('bug', 'high-priority')
 *   .withAIComment(createMockAIComment('CodeRabbit', 'Fix this'))
 *   .build();
 * ```
 */
export class PRContextBuilder {
  private context: Partial<PRContext> = {};

  withPrNumber(prNumber: number): this {
    this.context.prNumber = prNumber;
    return this;
  }

  withTitle(title: string): this {
    this.context.title = title;
    return this;
  }

  withDescription(description: string): this {
    this.context.description = description;
    return this;
  }

  withAuthor(author: string): this {
    this.context.author = author;
    return this;
  }

  withBranches(base: string, head: string): this {
    this.context.baseBranch = base;
    this.context.headBranch = head;
    return this;
  }

  withFiles(files: ChangedFile[]): this {
    this.context.changedFiles = files;
    this.context.totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    this.context.totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
    return this;
  }

  withLabels(...labels: string[]): this {
    this.context.labels = labels;
    return this;
  }

  withAIComment(comment: AIBotComment): this {
    if (!this.context.aiBotComments) {
      this.context.aiBotComments = [];
    }
    this.context.aiBotComments.push(comment);
    return this;
  }

  withDiff(diff: string, truncated: boolean = false): this {
    this.context.diff = diff;
    this.context.diffTruncated = truncated;
    return this;
  }

  withCommits(commits: Array<{ oid: string; messageHeadline: string; committedDate: string }>): this {
    this.context.commits = commits;
    return this;
  }

  build(): PRContext {
    return createMockPRContext(this.context);
  }
}
