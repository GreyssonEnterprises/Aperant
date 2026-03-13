/**
 * Unit tests for GitLab error parser
 */
import { describe, it, expect } from 'vitest';
import {
  parseGitLabError,
  isRecoverableGitLabError,
  GitLabErrorCode
} from '../gitlab-error-parser';

describe('gitlab-error-parser', () => {
  it('should parse 401 authentication errors', () => {
    const error = new Error('401 Unauthorized');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe(GitLabErrorCode.AUTHENTICATION_FAILED);
    expect(parsed.recoverable).toBe(true);
  });

  it('should parse 403 permission errors', () => {
    const error = new Error('403 Forbidden');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe(GitLabErrorCode.INSUFFICIENT_PERMISSIONS);
    expect(parsed.recoverable).toBe(true);
  });

  it('should parse 404 not found errors', () => {
    const error = new Error('404 Not Found');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe(GitLabErrorCode.PROJECT_NOT_FOUND);
    expect(parsed.recoverable).toBe(true);
  });

  it('should parse 409 conflict errors', () => {
    const error = new Error('409 Conflict');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe(GitLabErrorCode.CONFLICT);
    expect(parsed.recoverable).toBe(false);
  });

  it('should parse 429 rate limit errors', () => {
    const error = 'Rate limit exceeded';
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe(GitLabErrorCode.RATE_LIMITED);
    expect(parsed.recoverable).toBe(true);
  });

  it('should identify recoverable errors', () => {
    expect(isRecoverableGitLabError(new Error('401 Unauthorized'))).toBe(true);
    expect(isRecoverableGitLabError(new Error('Network error'))).toBe(true);
    expect(isRecoverableGitLabError(new Error('409 Conflict'))).toBe(false);
  });
});
