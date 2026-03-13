/**
 * GitLab Error Parser Utility
 *
 * Parses GitLab API errors and provides user-friendly error messages.
 * Follows the same pattern as GitHub's error parser.
 */

export interface ParsedGitLabError {
  message: string;
  code?: string;
  recoverable: boolean;
  action?: string;
}

/**
 * Parse a GitLab error and return a user-friendly message
 */
export function parseGitLabError(error: unknown): ParsedGitLabError {
  if (error instanceof Error) {
    return parseGitLabErrorMessage(error.message);
  }

  if (typeof error === 'string') {
    return parseGitLabErrorMessage(error);
  }

  return {
    message: 'An unknown error occurred',
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
      message: 'GitLab authentication failed. Please check your access token.',
      code: 'AUTHENTICATION_ERROR',
      recoverable: true,
      action: 'Update your GitLab token in project settings'
    };
  }

  // Rate limiting (429)
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return {
      message: 'GitLab rate limit exceeded. Please wait a moment before trying again.',
      code: 'RATE_LIMITED',
      recoverable: true,
      action: 'Wait a few moments before retrying'
    };
  }

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connect') || lowerMessage.includes('timeout')) {
    return {
      message: 'Network error. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
      recoverable: true,
      action: 'Check your internet connection'
    };
  }

  // Project not found (404)
  if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
    return {
      message: 'GitLab project not found. Please check your project configuration.',
      code: 'NOT_FOUND',
      recoverable: true,
      action: 'Verify your GitLab project settings'
    };
  }

  // Permission denied (403)
  if (lowerMessage.includes('403') || lowerMessage.includes('forbidden') || lowerMessage.includes('permission denied')) {
    return {
      message: 'Insufficient permissions. Please check your GitLab access token scopes.',
      code: 'PERMISSION_DENIED',
      recoverable: true,
      action: 'Update your token with the required permissions'
    };
  }

  // Conflict (409)
  if (lowerMessage.includes('409') || lowerMessage.includes('conflict')) {
    return {
      message: 'There was a conflict with the current state of the resource.',
      code: 'CONFLICT',
      recoverable: false,
      action: 'Refresh and try again'
    };
  }

  // Default error
  return {
    message: message || 'An unknown error occurred',
    recoverable: true
  };
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableGitLabError(error: unknown): boolean {
  const parsed = parseGitLabError(error);
  return parsed.recoverable;
}

/**
 * Get suggested action for an error
 */
export function getGitLabErrorAction(error: unknown): string | undefined {
  const parsed = parseGitLabError(error);
  return parsed.action;
}

/**
 * Format error for display
 */
export function formatGitLabError(error: unknown): string {
  const parsed = parseGitLabError(error);
  if (parsed.action) {
    return `${parsed.message} ${parsed.action}`;
  }
  return parsed.message;
}
