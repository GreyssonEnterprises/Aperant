/**
 * GitLab Error Parser Utility
 *
 * Parses GitLab API errors and returns error codes for i18n translation.
 * Follows the same pattern as GitHub's error parser.
 */

export enum GitLabErrorCode {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  CONFLICT = 'CONFLICT',
  UNKNOWN = 'UNKNOWN'
}

export interface ParsedGitLabError {
  code: GitLabErrorCode;
  recoverable: boolean;
  details?: string;
}

/**
 * Parse a GitLab error and return an error code
 */
export function parseGitLabError(error: unknown): ParsedGitLabError {
  if (error instanceof Error) {
    return parseGitLabErrorMessage(error.message);
  }

  if (typeof error === 'string') {
    return parseGitLabErrorMessage(error);
  }

  // Handle Error-like objects with a message property
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: string }).message;
    if (typeof message === 'string') {
      return parseGitLabErrorMessage(message);
    }
  }

  return {
    code: GitLabErrorCode.UNKNOWN,
    recoverable: false
  };
}

/**
 * Parse GitLab error message
 */
function parseGitLabErrorMessage(message: string): ParsedGitLabError {
  const lowerMessage = message.toLowerCase();

  // Check for explicit HTTP status code in response (if available)
  // Try to extract status from common patterns like "Status: 401" or HTTP error responses
  const statusMatch = message.match(/\bstatus:\s*(\d{3})\b/i) ||
                       message.match(/\bhttp\s+(\d{3})\b/i) ||
                       lowerMessage.match(/\b"status":\s*(\d{3})\b/);

  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    switch (statusCode) {
      case 401:
        return { code: GitLabErrorCode.AUTHENTICATION_FAILED, recoverable: true };
      case 403:
        return { code: GitLabErrorCode.INSUFFICIENT_PERMISSIONS, recoverable: true };
      case 404:
        return { code: GitLabErrorCode.PROJECT_NOT_FOUND, recoverable: true };
      case 409:
        return { code: GitLabErrorCode.CONFLICT, recoverable: false };
      case 429:
        return { code: GitLabErrorCode.RATE_LIMITED, recoverable: true };
    }
  }

  // Fallback to message content analysis with word-boundary regex to avoid false matches
  // Authentication errors
  if (/\b401\b/.test(message) || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid token')) {
    return {
      code: GitLabErrorCode.AUTHENTICATION_FAILED,
      recoverable: true
    };
  }

  // Rate limiting (429)
  if (/\b429\b/.test(message) || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return {
      code: GitLabErrorCode.RATE_LIMITED,
      recoverable: true
    };
  }

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connect') || lowerMessage.includes('timeout')) {
    return {
      code: GitLabErrorCode.NETWORK_ERROR,
      recoverable: true
    };
  }

  // Project not found (404)
  if (/\b404\b/.test(message) || lowerMessage.includes('not found')) {
    return {
      code: GitLabErrorCode.PROJECT_NOT_FOUND,
      recoverable: true
    };
  }

  // Permission denied (403)
  if (/\b403\b/.test(message) || lowerMessage.includes('forbidden') || lowerMessage.includes('permission denied')) {
    return {
      code: GitLabErrorCode.INSUFFICIENT_PERMISSIONS,
      recoverable: true
    };
  }

  // Conflict (409)
  if (/\b409\b/.test(message) || lowerMessage.includes('conflict')) {
    return {
      code: GitLabErrorCode.CONFLICT,
      recoverable: false
    };
  }

  // Default error
  return {
    code: GitLabErrorCode.UNKNOWN,
    recoverable: false,
    details: message
  };
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableGitLabError(error: unknown): boolean {
  const parsed = parseGitLabError(error);
  return parsed.recoverable;
}
