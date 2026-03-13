/**
 * GitLab Stores - Focused state management for GitLab integration
 *
 * This module exports all GitLab-related stores and their utilities.
 */

// Issues Store
export {
  useIssuesStore,
  loadGitLabIssues,
  importGitLabIssues,
  type IssueFilterState
} from './issues-store';

// MR Review Store
export {
  useMRReviewStore,
  initializeMRReviewListeners,
  cleanupMRReviewListeners,
  startMRReview,
  startFollowupReview
} from './mr-review-store';
import {
  initializeMRReviewListeners as _initMRReviewListeners,
  cleanupMRReviewListeners as _cleanupMRReviewListeners
} from './mr-review-store';

// Investigation Store
export {
  useInvestigationStore,
  investigateGitLabIssue
} from './investigation-store';

// Sync Status Store
export {
  useSyncStatusStore,
  checkGitLabConnection
} from './sync-status-store';

/**
 * Initialize all global GitLab listeners.
 * Call this once at app startup.
 */
export function initializeGitLabListeners(): void {
  _initMRReviewListeners();
  // Add other global listeners here as needed
}

/**
 * Cleanup all global GitLab listeners.
 * Call this during app unmount or hot-reload.
 */
export function cleanupGitLabListeners(): void {
  _cleanupMRReviewListeners();
  // Add other cleanup implementations here as needed
}

// Re-export types for convenience
export type {
  GitLabMRReviewProgress,
  GitLabMRReviewResult,
  GitLabNewCommitsCheck,
  GitLabMergeRequest,
  GitLabSyncStatus,
  GitLabInvestigationStatus,
  GitLabInvestigationResult,
  GitLabIssue
} from '../../../shared/types';
