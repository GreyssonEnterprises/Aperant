/**
 * Unit tests for GitLab sync status store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncStatusStore } from '../sync-status-store';
import type { GitLabSyncStatus } from '../../../../shared/types';

describe('sync-status-store', () => {
  beforeEach(() => {
    useSyncStatusStore.getState().clearSyncStatus();
  });

  it('should initialize with empty state', () => {
    const state = useSyncStatusStore.getState();
    expect(state.syncStatus).toBe(null);
    expect(state.connectionError).toBe(null);
  });

  it('should set sync status', () => {
    const status: GitLabSyncStatus = {
      connected: true,
      projectPathWithNamespace: 'group/project'
    };
    useSyncStatusStore.getState().setSyncStatus(status);
    expect(useSyncStatusStore.getState().syncStatus).toEqual(status);
  });

  it('should check connection status', () => {
    useSyncStatusStore.getState().setSyncStatus({
      connected: true,
      projectPathWithNamespace: 'group/project'
    });
    expect(useSyncStatusStore.getState().isConnected()).toBe(true);
    expect(useSyncStatusStore.getState().getProjectPath()).toBe('group/project');
  });

  it('should handle disconnected state', () => {
    useSyncStatusStore.getState().setSyncStatus({
      connected: false,
      projectPathWithNamespace: undefined
    });
    expect(useSyncStatusStore.getState().isConnected()).toBe(false);
    expect(useSyncStatusStore.getState().getProjectPath()).toBe(null);
  });

  it('should set connection error', () => {
    useSyncStatusStore.getState().setConnectionError('Connection failed');
    expect(useSyncStatusStore.getState().connectionError).toBe('Connection failed');
  });

  it('should clear sync status', () => {
    useSyncStatusStore.getState().setSyncStatus({
      connected: true,
      projectPathWithNamespace: 'group/project'
    });
    useSyncStatusStore.getState().clearSyncStatus();

    expect(useSyncStatusStore.getState().syncStatus).toBe(null);
    expect(useSyncStatusStore.getState().connectionError).toBe(null);
  });
});
