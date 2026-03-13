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

export type IssueFilterState = GitLabFilterState;

interface IssuesState {
  // Data
  issues: GitLabIssue[];

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueIid: number | null;
  filterState: IssueFilterState;

  // Actions
  setIssues: (issues: GitLabIssue[]) => void;
  addIssue: (issue: GitLabIssue) => void;
  updateIssue: (issueIid: number, updates: Partial<GitLabIssue>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueIid: number | null) => void;
  setFilterState: (state: IssueFilterState) => void;
  clearIssues: () => void;

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
    error: null
  }),

  // Selectors
  getSelectedIssue: () => {
    const { issues, selectedIssueIid } = get();
    return issues.find(i => i.iid === selectedIssueIid) || null;
  },

  getFilteredIssues: () => {
    const { issues, filterState } = get();
    if (filterState === 'all') return issues;
    // Handle 'opened' vs 'open' normalization
    if (filterState === 'opened') {
      return issues.filter(issue => issue.state === 'opened' || issue.state === 'open');
    }
    return issues.filter(issue => issue.state === filterState);
  },

  getOpenIssuesCount: () => {
    const { issues } = get();
    return issues.filter(issue => issue.state === 'opened' || issue.state === 'open').length;
  }
}));

/**
 * Load GitLab issues for a project
 */
export async function loadGitLabIssues(
  projectId: string,
  state?: IssueFilterState
): Promise<void> {
  const store = useIssuesStore.getState();
  store.setLoading(true);
  store.setError(null);

  // Sync filterState with the requested state
  if (state) {
    store.setFilterState(state);
  }

  try {
    const result = await window.electronAPI.getGitLabIssues(projectId, state);
    if (result.success && result.data) {
      store.setIssues(result.data);
    } else {
      store.setError(result.error || 'Failed to load GitLab issues');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
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
