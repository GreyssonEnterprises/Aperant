/**
 * Shared Test Utilities for PR Review Suite
 * ==========================================
 *
 * Barrel exports for all test utility modules.
 * Import from this file for cleaner imports:
 *
 * ```ts
 * import { createMockProject, createMockFinding } from '@/shared/test-utils';
 * ```
 */

// GitHub API mocks
export {
  mockSuccessfulPR,
  mockGitHubError,
  setupMockGitHubFetch,
  mockGraphQLResponse,
  mockRateLimitError
} from './github-mocks';

// GitHub API types
export type { MockFetchResponse, GitHubErrorBody, GraphQLError } from './github-mocks';

// Vercel AI SDK mocks
export {
  mockGenerateText,
  mockStreamText,
  createMockAIClient,
  mockToolResult,
  mockConversationHistory
} from './ai-sdk-mocks';

// Vercel AI SDK types
export type { MockGenerateTextResult, MockStreamStep } from './ai-sdk-mocks';

// PR fixtures
export {
  SIMPLE_PR_CONTEXT,
  COMPLEX_PR_CONTEXT,
  PR_WITH_SECURITY_ISSUE,
  PR_WITH_AI_COMMENTS,
  EMPTY_PR_CONTEXT
} from './pr-fixtures';

// Mock factories
export {
  createMockProject,
  createMockGitHubConfig,
  createMockPRContext,
  createMockFinding,
  createMockReviewResult,
  createMockProgress,
  createMockChangedFile,
  createMockAIComment,
  createMockFindings,
  createMockScanResult,
  PRContextBuilder
} from './mock-factories';

// Mock factory types
export type { MockScanResult } from './mock-factories';
