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

  // Authentication errors
  if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid token')) {
    return {
      code: GitLabErrorCode.AUTHENTICATION_FAILED,
      recoverable: true
    };
  }

  // Rate limiting (429)
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
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
  if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
    return {
      code: GitLabErrorCode.PROJECT_NOT_FOUND,
      recoverable: true
    };
  }

  // Permission denied (403)
  if (lowerMessage.includes('403') || lowerMessage.includes('forbidden') || lowerMessage.includes('permission denied')) {
    return {
      code: GitLabErrorCode.INSUFFICIENT_PERMISSIONS,
      recoverable: true
    };
  }

  // Conflict (409)
  if (lowerMessage.includes('409') || lowerMessage.includes('conflict')) {
    return {
      code: GitLabErrorCode.CONFLICT,
      recoverable: false
    };
  }

  // Default error
  return {
    code: GitLabErrorCode.UNKNOWN,
    recoverable: true,
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
