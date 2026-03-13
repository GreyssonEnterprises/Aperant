/**
 * Unit tests for GitLab sync status store
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSyncStatusStore } from '@/stores/gitlab/sync-status-store';
import { checkGitLabConnection } from '@/stores/gitlab/sync-status-store';
import type { GitLabSyncStatus } from '@shared/types';

// Mock electronAPI
const mockElectronAPI = {
  checkGitLabConnection: vi.fn()
};

describe('sync-status-store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      ...(globalThis.window ?? {}),
      electronAPI: mockElectronAPI
    } as unknown as Window & typeof globalThis);
    useSyncStatusStore.getState().clearSyncStatus();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  describe('checkGitLabConnection', () => {
    it('should update store on successful connection', async () => {
      mockElectronAPI.checkGitLabConnection.mockResolvedValue({
        success: true,
        data: {
          connected: true,
          projectPathWithNamespace: 'group/project'
        }
      });

      const result = await checkGitLabConnection('project-123');

      expect(result).toEqual({
        connected: true,
        projectPathWithNamespace: 'group/project'
      });
      expect(useSyncStatusStore.getState().syncStatus).toEqual({
        connected: true,
        projectPathWithNamespace: 'group/project'
      });
      expect(useSyncStatusStore.getState().connectionError).toBe(null);
    });

    it('should set error on failed connection', async () => {
      mockElectronAPI.checkGitLabConnection.mockResolvedValue({
        success: false,
        error: 'Authentication failed'
      });

      const result = await checkGitLabConnection('project-123');

      expect(result).toBe(null);
      expect(useSyncStatusStore.getState().syncStatus).toBe(null);
      expect(useSyncStatusStore.getState().connectionError).toBe('Authentication failed');
    });

    it('should set error when connected is false', async () => {
      mockElectronAPI.checkGitLabConnection.mockResolvedValue({
        success: true,
        data: {
          connected: false,
          error: 'Project not found'
        }
      });

      const result = await checkGitLabConnection('project-123');

      expect(result).toBe(null);
      expect(useSyncStatusStore.getState().syncStatus).toBe(null);
      expect(useSyncStatusStore.getState().connectionError).toBe('Project not found');
    });

    it('should set error on exception', async () => {
      mockElectronAPI.checkGitLabConnection.mockRejectedValue(new Error('Network error'));

      const result = await checkGitLabConnection('project-123');

      expect(result).toBe(null);
      expect(useSyncStatusStore.getState().syncStatus).toBe(null);
      expect(useSyncStatusStore.getState().connectionError).toBe('Network error');
    });
  });
});
