/**
 * Shared integration types for GitHub and GitLab
 */

export interface IntegrationError {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

export interface SyncStatus {
  connected: boolean;
  repoFullName: string | null;
}

export interface InvestigationStatus {
  phase: 'idle' | 'fetching' | 'analyzing' | 'complete' | 'error';
  progress: number;
  message: string;
  issueNumber?: number;
  mrIid?: number;
}

export interface InvestigationResult {
  issueNumber?: number;
  mrIid?: number;
  summary: string;
  findings: string[];
  relatedFiles: string[];
  suggestedActions: string[];
}

export interface PaginationState {
  currentPage: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}

/**
 * Platform-specific filter states
 * GitHub uses 'open', GitLab uses 'opened'
 * Both use 'closed' and 'all'
 * GitLab additionally has 'merged' for MRs
 */
export type GitHubFilterState = 'open' | 'closed' | 'all';
export type GitLabFilterState = 'opened' | 'closed' | 'merged' | 'all';
export type FilterState = GitHubFilterState | GitLabFilterState;
