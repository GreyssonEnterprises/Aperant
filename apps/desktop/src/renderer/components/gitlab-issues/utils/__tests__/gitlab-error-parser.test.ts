/**
 * Unit tests for GitLab error parser
 */
import { describe, it, expect } from 'vitest';
import {
  parseGitLabError,
  isRecoverableGitLabError,
  getGitLabErrorAction,
  formatGitLabError
} from '../gitlab-error-parser';

describe('gitlab-error-parser', () => {
  it('should parse 401 authentication errors', () => {
    const error = new Error('401 Unauthorized');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe('AUTHENTICATION_ERROR');
    expect(parsed.recoverable).toBe(true);
    expect(parsed.action).toBeDefined();
    expect(parsed.message).toContain('authentication failed');
  });

  it('should parse 403 permission errors', () => {
    const error = new Error('403 Forbidden');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe('PERMISSION_DENIED');
    expect(parsed.recoverable).toBe(true);
    expect(parsed.action).toBeDefined();
  });

  it('should parse 404 not found errors', () => {
    const error = new Error('404 Not Found');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.recoverable).toBe(true);
  });

  it('should parse 409 conflict errors', () => {
    const error = new Error('409 Conflict');
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe('CONFLICT');
    expect(parsed.recoverable).toBe(false);
  });

  it('should parse 429 rate limit errors', () => {
    const error = 'Rate limit exceeded';
    const parsed = parseGitLabError(error);

    expect(parsed.code).toBe('RATE_LIMITED');
    expect(parsed.recoverable).toBe(true);
  });

  it('should identify recoverable errors', () => {
    expect(isRecoverableGitLabError(new Error('401 Unauthorized'))).toBe(true);
    expect(isRecoverableGitLabError(new Error('Network error'))).toBe(true);
    expect(isRecoverableGitLabError(new Error('409 Conflict'))).toBe(false);
  });

  it('should get error action', () => {
    const error = new Error('401 Unauthorized');
    const action = getGitLabErrorAction(error);

    expect(action).toBeDefined();
    expect(action).toContain('token');
  });

  it('should format error for display', () => {
    const error = new Error('401 Unauthorized');
    const formatted = formatGitLabError(error);

    expect(formatted).toContain('authentication failed');
  });
});
