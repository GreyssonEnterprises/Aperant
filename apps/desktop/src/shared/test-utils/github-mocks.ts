/**
 * GitHub API Mock Utilities
 * =========================
 *
 * Mock helpers for GitHub REST and GraphQL API responses in PR review tests.
 * Supports Vitest vi.fn() mocking patterns.
 */

import { vi } from 'vitest';
import type { PRData } from '../../preload/api/modules/github-api';

/**
 * Mock successful GitHub PR fetch response
 *
 * @param prNumber - PR number
 * @param overrides - Optional overrides for default PR data
 * @returns Mock PR data object
 *
 * @example
 * ```ts
 * const mockPR = mockSuccessfulPR(42, {
 *   title: 'Fix authentication bug',
 *   additions: 100
 * });
 * ```
 */
export function mockSuccessfulPR(prNumber: number, overrides: Partial<PRData> = {}): PRData {
  return {
    number: prNumber,
    title: `Test PR #${prNumber}`,
    body: 'Test PR description',
    state: 'open',
    author: { login: 'testuser' },
    headRefName: 'feature/test-branch',
    baseRefName: 'develop',
    additions: 50,
    deletions: 20,
    changedFiles: 5,
    assignees: [],
    files: [
      {
        path: 'src/test.ts',
        additions: 30,
        deletions: 10,
        status: 'modified'
      },
      {
        path: 'src/utils/helpers.ts',
        additions: 20,
        deletions: 10,
        status: 'modified'
      }
    ],
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-15T12:00:00Z',
    htmlUrl: `https://github.com/test/repo/pull/${prNumber}`,
    ...overrides
  };
}

/**
 * Mock GitHub API error response
 *
 * @param status - HTTP status code
 * @param errorBody - Error response body
 * @returns Mock error response
 *
 * @example
 * ```ts
 * const error = mockGitHubError(401, {
 *   message: 'Bad credentials',
 *   documentation_url: 'https://docs.github.com/rest'
 * });
 * ```
 */
export interface GitHubErrorBody {
  message: string;
  documentation_url?: string;
  errors?: Array<{ resource: string; field: string; code: string }>;
}

export function mockGitHubError(status: number, errorBody: Partial<GitHubErrorBody> = {}): {
  status: number;
  data: GitHubErrorBody;
} {
  return {
    status,
    data: {
      message: 'An error occurred',
      documentation_url: 'https://docs.github.com/rest',
      ...errorBody
    }
  };
}

/**
 * Setup mock fetch for GitHub API
 *
 * Configures global.fetch to return mocked GitHub responses.
 * Use with vi.restoreAllMocks() in afterEach cleanup.
 *
 * @param mock - Mock response data or error
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setupMockGitHubFetch({
 *     ok: true,
 *     status: 200,
 *     json: async () => mockSuccessfulPR(42)
 *   });
 * });
 *
 * afterEach(() => {
 *   vi.restoreAllMocks();
 * });
 * ```
 */
export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}

export function setupMockGitHubFetch(mock: MockFetchResponse): void {
  global.fetch = vi.fn(() => Promise.resolve(mock as Response)) as unknown as typeof fetch;
}

/**
 * Mock GitHub GraphQL response
 *
 * @param data - GraphQL response data
 * @param errors - Optional GraphQL errors
 * @returns Mock GraphQL response
 *
 * @example
 * ```ts
 * const mockResponse = mockGraphQLResponse({
 *   repository: {
 *     pullRequest: mockSuccessfulPR(42)
 *   }
 * });
 * ```
 */
export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  locations?: [{ line: number; column: number }];
  extensions?: Record<string, unknown>;
}

export function mockGraphQLResponse(data: Record<string, unknown>, errors: GraphQLError[] = []): {
  data: Record<string, unknown>;
  errors?: GraphQLError[];
} {
  const response: { data: Record<string, unknown>; errors?: GraphQLError[] } = { data };
  if (errors.length > 0) {
    response.errors = errors;
  }
  return response;
}

/**
 * Mock GitHub rate limit error response
 *
 * @param retryAfter - Seconds until retry (default 60)
 * @returns Mock rate limit error
 */
export function mockRateLimitError(retryAfter: number = 60): MockFetchResponse {
  return {
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    json: async () => ({
      message: 'API rate limit exceeded',
      documentation_url: 'https://docs.github.com/rest/rate-limit',
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + retryAfter)
      }
    })
  };
}
