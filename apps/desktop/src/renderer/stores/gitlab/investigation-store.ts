/**
 * GitLab Investigation Store
 *
 * Tracks investigation state for GitLab issues.
 * Mirrors github investigation patterns.
 */
import { create } from 'zustand';
import type {
  GitLabInvestigationStatus,
  GitLabInvestigationResult
} from '../../../shared/types';

interface InvestigationState {
  // Investigation state
  investigationStatus: GitLabInvestigationStatus;
  lastInvestigationResult: GitLabInvestigationResult | null;

  // Actions
  setInvestigationStatus: (status: GitLabInvestigationStatus) => void;
  setInvestigationResult: (result: GitLabInvestigationResult | null) => void;
  clearInvestigation: () => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  // Initial state
  investigationStatus: {
    phase: 'idle',
    progress: 0,
    message: ''
  },
  lastInvestigationResult: null,

  // Actions
  setInvestigationStatus: (investigationStatus) => set({ investigationStatus }),

  setInvestigationResult: (lastInvestigationResult) => set({ lastInvestigationResult }),

  clearInvestigation: () => set({
    investigationStatus: { phase: 'idle', progress: 0, message: '' },
    lastInvestigationResult: null
  })
}));

/**
 * Start investigating a GitLab issue
 */
export function investigateGitLabIssue(
  projectId: string,
  issueIid: number,
  selectedNoteIds?: number[]
): void {
  const store = useInvestigationStore.getState();
  store.setInvestigationStatus({
    phase: 'fetching',
    issueIid,
    progress: 0,
    message: 'Starting investigation...'
  });
  store.setInvestigationResult(null);

  window.electronAPI.investigateGitLabIssue(projectId, issueIid, selectedNoteIds);
}
