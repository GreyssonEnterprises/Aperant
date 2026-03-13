/**
 * Hook for filtering and searching GitLab MRs
 *
 * Stub hook - implements the same pattern as usePRFiltering
 * adapted for GitLab merge requests.
 */

import { useMemo, useState, useCallback } from 'react';
import type { GitLabMergeRequest, GitLabMRReviewResult, GitLabNewCommitsCheck } from '../../../../shared/types';

export type GitLabMRStatusFilter =
  | 'all'
  | 'reviewing'
  | 'not_reviewed'
  | 'reviewed'
  | 'posted'
  | 'changes_requested'
  | 'ready_to_merge'
  | 'ready_for_followup';

export type GitLabMRSortOption = 'newest' | 'oldest' | 'largest';

export interface GitLabMRFilterState {
  searchQuery: string;
  contributors: string[];
  statuses: GitLabMRStatusFilter[];
  sortBy: GitLabMRSortOption;
}

interface GitLabMRReviewInfo {
  isReviewing: boolean;
  result: GitLabMRReviewResult | null;
  newCommitsCheck?: GitLabNewCommitsCheck | null;
}

const DEFAULT_FILTERS: GitLabMRFilterState = {
  searchQuery: '',
  contributors: [],
  statuses: [],
  sortBy: 'newest',
};

/**
 * Determine the computed status of an MR based on its review state
 */
function getMRComputedStatus(
  reviewInfo: GitLabMRReviewInfo | null
): GitLabMRStatusFilter {
  // Check if currently reviewing (highest priority)
  if (reviewInfo?.isReviewing) {
    return 'reviewing';
  }

  if (!reviewInfo?.result) {
    return 'not_reviewed';
  }

  const result = reviewInfo.result;
  const hasPosted = Boolean(result.hasPostedFindings);
  // Use overallStatus from review result as source of truth, fallback to severity check
  const hasBlockingFindings =
    result.overallStatus === 'request_changes' ||
    result.findings?.some(f => f.severity === 'critical' || f.severity === 'high');
  const hasNewCommits = reviewInfo.newCommitsCheck?.hasNewCommits;
  // For GitLab, check if new commits exist after review
  const hasCommitsAfterPosting = hasNewCommits && hasPosted;

  // Check for ready for follow-up first (highest priority after posting)
  // Must have new commits that happened AFTER findings were posted
  if (hasPosted && hasNewCommits && hasCommitsAfterPosting) {
    return 'ready_for_followup';
  }

  // Posted with blocking findings
  if (hasPosted && hasBlockingFindings) {
    return 'changes_requested';
  }

  // Posted without blocking findings
  if (hasPosted) {
    return 'ready_to_merge';
  }

  // Has review result but not posted yet
  return 'reviewed';
}

export function useGitLabMRFiltering(
  mrs: GitLabMergeRequest[],
  getReviewStateForMR: (mrIid: number) => {
    isReviewing: boolean;
    progress: GitLabMRReviewResult | null;
    result: GitLabMRReviewResult | null;
    error: string | null;
    newCommitsCheck: GitLabNewCommitsCheck | null;
  } | null
) {
  const [filters, setFiltersState] = useState<GitLabMRFilterState>(DEFAULT_FILTERS);

  // Derive unique contributors from MRs
  const contributors = useMemo(() => {
    const authorSet = new Set<string>();
    mrs.forEach(mr => {
      if (mr.author?.username) {
        authorSet.add(mr.author.username);
      }
    });
    return Array.from(authorSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [mrs]);

  // Filter and sort MRs based on current filters
  const filteredMRs = useMemo(() => {
    const filtered = mrs.filter(mr => {
      // Search filter - matches title or description
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesTitle = mr.title.toLowerCase().includes(query);
        const matchesDescription = mr.description?.toLowerCase().includes(query);
        const matchesIid = mr.iid.toString().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesIid) {
          return false;
        }
      }

      // Contributors filter (multi-select)
      if (filters.contributors.length > 0) {
        const authorUsername = mr.author?.username;
        if (!authorUsername || !filters.contributors.includes(authorUsername)) {
          return false;
        }
      }

      // Status filter (multi-select)
      if (filters.statuses.length > 0) {
        const reviewInfo = getReviewStateForMR(mr.iid);
        const computedStatus = getMRComputedStatus(reviewInfo);

        // Check if MR matches any of the selected statuses
        const matchesStatus = filters.statuses.some(status => {
          // Special handling: 'posted' should match any posted state
          if (status === 'posted') {
            const hasPosted = reviewInfo?.result?.hasPostedFindings;
            return hasPosted;
          }
          return computedStatus === status;
        });

        if (!matchesStatus) {
          return false;
        }
      }

      return true;
    });

    // Pre-compute timestamps to avoid creating Date objects on every comparison
    const timestamps = new Map(
      filtered.map((mr) => [mr.iid, new Date(mr.createdAt).getTime()])
    );

    // Sort the filtered results
    return filtered.sort((a, b) => {
      const aTime = timestamps.get(a.iid)!;
      const bTime = timestamps.get(b.iid)!;

      switch (filters.sortBy) {
        case 'newest':
          // Sort by createdAt descending (most recent first)
          return bTime - aTime;
        case 'oldest':
          // Sort by createdAt ascending (oldest first)
          return aTime - bTime;
        case 'largest':
          // Sort by title length as a proxy for complexity (descending)
          const aTitleLen = a.title.length;
          const bTitleLen = b.title.length;
          if (bTitleLen !== aTitleLen) return bTitleLen - aTitleLen;
          // Secondary sort by createdAt (newest first) for stable ordering
          return bTime - aTime;
        default:
          return 0;
      }
    });
  }, [mrs, filters, getReviewStateForMR]);

  // Filter setters
  const setSearchQuery = useCallback((query: string) => {
    setFiltersState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setContributors = useCallback((contributors: string[]) => {
    setFiltersState(prev => ({ ...prev, contributors }));
  }, []);

  const setStatuses = useCallback((statuses: GitLabMRStatusFilter[]) => {
    setFiltersState(prev => ({ ...prev, statuses }));
  }, []);

  const setSortBy = useCallback((sortBy: GitLabMRSortOption) => {
    setFiltersState(prev => ({ ...prev, sortBy }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState((prev) => ({
      ...DEFAULT_FILTERS,
      sortBy: prev.sortBy, // Preserve sort preference when clearing filters
    }));
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchQuery !== '' ||
      filters.contributors.length > 0 ||
      filters.statuses.length > 0
    );
  }, [filters]);

  return {
    filteredMRs,
    contributors,
    filters,
    setSearchQuery,
    setContributors,
    setStatuses,
    setSortBy,
    clearFilters,
    hasActiveFilters,
  };
}
