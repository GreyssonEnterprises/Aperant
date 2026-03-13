/**
 * GitLab Issues Store
 *
 * Manages GitLab issue state with filtering.
 * Mirrors the structure of github/issues-store.ts.
 *
 * Note: Pagination support will be added with IPC handlers (Task 8)
 */
import { create } from 'zustand';
import type { GitLabIssue } from '../../../shared/types';
import type { GitLabFilterState } from '../../../shared/integrations/types/base-types';

// GitLab issues don't have 'merged' state (only MRs do), so create a specific type
export type IssueFilterState = Exclude<GitLabFilterState, 'merged'>;

interface IssuesState {
  // Data
  issues: GitLabIssue[];

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueIid: number | null;
  filterState: IssueFilterState;
  currentRequestToken: string | null;

  // Actions
  setIssues: (issues: GitLabIssue[]) => void;
  addIssue: (issue: GitLabIssue) => void;
  updateIssue: (issueIid: number, updates: Partial<GitLabIssue>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueIid: number | null) => void;
  setFilterState: (state: IssueFilterState) => void;
  clearIssues: () => void;
  setCurrentRequestToken: (token: string | null) => void;

  // Selectors
  getSelectedIssue: () => GitLabIssue | null;
  getFilteredIssues: () => GitLabIssue[];
  getOpenIssuesCount: () => number;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  // Initial state
  issues: [],
  isLoading: false,
  error: null,
  selectedIssueIid: null,
  filterState: 'opened',
  currentRequestToken: null,

  // Actions
  setIssues: (issues) => set({ issues, error: null }),

  addIssue: (issue) => set((state) => ({
    issues: [issue, ...state.issues.filter(i => i.iid !== issue.iid)]
  })),

  updateIssue: (issueIid, updates) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.iid === issueIid ? { ...issue, ...updates } : issue
    )
  })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  selectIssue: (selectedIssueIid) => set({ selectedIssueIid }),

  setFilterState: (filterState) => set({ filterState }),

  clearIssues: () => set({
    issues: [],
    selectedIssueIid: null,
    error: null,
    currentRequestToken: null
  }),

  setCurrentRequestToken: (currentRequestToken) => set({ currentRequestToken }),

  // Selectors
  getSelectedIssue: () => {
    const { issues, selectedIssueIid } = get();
    return issues.find(i => i.iid === selectedIssueIid) || null;
  },

  getFilteredIssues: () => {
    const { issues, filterState } = get();
    if (filterState === 'all') return issues;
    return issues.filter(issue => issue.state === filterState);
  },

  getOpenIssuesCount: () => {
    const { issues } = get();
    return issues.filter(issue => issue.state === 'opened').length;
  }
}));

/**
 * Load GitLab issues for a project
 */
export async function loadGitLabIssues(
  projectId: string,
  state?: IssueFilterState
): Promise<void> {
  const requestId = Math.random().toString(36);
  const store = useIssuesStore.getState();
  store.setCurrentRequestToken(requestId);
  store.setLoading(true);
  store.setError(null);

  // Sync filterState with the requested state
  if (state) {
    store.setFilterState(state);
  }

  try {
    const result = await window.electronAPI.getGitLabIssues(projectId, state);

    // Guard against stale responses
    if (store.currentRequestToken !== requestId) {
      return; // A newer request has superseded this one
    }

    if (result.success && result.data) {
      store.setIssues(result.data);
    } else {
      store.setError(result.error || 'Failed to load GitLab issues');
    }
  } catch (error) {
    // Guard against stale responses in error case
    if (store.currentRequestToken !== requestId) {
      return;
    }
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    // Only clear loading state if this is still the current request
    if (store.currentRequestToken === requestId) {
      store.setLoading(false);
    }
  }
}

/**
 * Import GitLab issues as tasks
 */
export async function importGitLabIssues(
  projectId: string,
  issueIids: number[]
): Promise<boolean> {
  const store = useIssuesStore.getState();
  store.setLoading(true);
  store.setError(null); // Clear previous errors

  try {
    const result = await window.electronAPI.importGitLabIssues(projectId, issueIids);
    if (result.success) {
      return true;
    } else {
      store.setError(result.error || 'Failed to import GitLab issues');
      return false;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    store.setLoading(false);
  }
}
