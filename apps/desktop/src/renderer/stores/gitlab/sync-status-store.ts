/**
 * GitLab Sync Status Store
 *
 * Tracks GitLab connection status for a project.
 * Mirrors github sync status patterns.
 */
import { create } from 'zustand';
import type { GitLabSyncStatus } from '../../../shared/types';

interface SyncStatusState {
  // Sync status
  syncStatus: GitLabSyncStatus | null;
  connectionError: string | null;

  // Actions
  setSyncStatus: (status: GitLabSyncStatus | null) => void;
  setConnectionError: (error: string | null) => void;
  clearSyncStatus: () => void;

  // Selectors
  isConnected: () => boolean;
  getProjectPath: () => string | null; // Returns projectPathWithNamespace
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  // Initial state
  syncStatus: null,
  connectionError: null,

  // Actions
  setSyncStatus: (syncStatus) => set({ syncStatus, connectionError: null }),

  setConnectionError: (connectionError) => set({ connectionError }),

  clearSyncStatus: () => set({
    syncStatus: null,
    connectionError: null
  }),

  // Selectors
  isConnected: () => {
    const { syncStatus } = get();
    return syncStatus?.connected ?? false;
  },

  getProjectPath: () => {
    const { syncStatus } = get();
    return syncStatus?.projectPathWithNamespace ?? null;
  }
}));

/**
 * Check GitLab connection status
 */
export async function checkGitLabConnection(projectId: string): Promise<GitLabSyncStatus | null> {
  const store = useSyncStatusStore.getState();

  try {
    const result = await window.electronAPI.checkGitLabConnection(projectId);
    if (result.success && result.data) {
      store.setSyncStatus(result.data);
      return result.data;
    } else {
      store.setConnectionError(result.error || 'Failed to check GitLab connection');
      return null;
    }
  } catch (error) {
    store.setConnectionError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
