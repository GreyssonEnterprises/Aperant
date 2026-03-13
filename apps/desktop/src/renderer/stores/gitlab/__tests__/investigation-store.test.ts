/**
 * Unit tests for GitLab investigation store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useInvestigationStore } from '../investigation-store';
import type { GitLabInvestigationStatus, GitLabInvestigationResult } from '../../../../shared/types';

describe('investigation-store', () => {
  beforeEach(() => {
    useInvestigationStore.getState().clearInvestigation();
  });

  it('should initialize with idle state', () => {
    const state = useInvestigationStore.getState();
    expect(state.investigationStatus.phase).toBe('idle');
    expect(state.lastInvestigationResult).toBe(null);
  });

  it('should set investigation status', () => {
    const status: GitLabInvestigationStatus = {
      phase: 'fetching',
      issueIid: 1,
      progress: 25,
      message: 'Fetching issue...'
    };
    useInvestigationStore.getState().setInvestigationStatus(status);
    expect(useInvestigationStore.getState().investigationStatus.phase).toBe('fetching');
  });

  it('should set investigation result', () => {
    const result: GitLabInvestigationResult = {
      success: true,
      issueIid: 1,
      analysis: {
        summary: 'Test summary',
        proposedSolution: 'Fix the bug',
        affectedFiles: ['file.ts'],
        estimatedComplexity: 'simple',
        acceptanceCriteria: ['Test passes']
      }
    };
    useInvestigationStore.getState().setInvestigationResult(result);
    expect(useInvestigationStore.getState().lastInvestigationResult?.issueIid).toBe(1);
  });

  it('should clear investigation', () => {
    useInvestigationStore.getState().setInvestigationStatus({
      phase: 'fetching',
      progress: 50,
      message: 'Testing'
    });
    useInvestigationStore.getState().clearInvestigation();

    const state = useInvestigationStore.getState();
    expect(state.investigationStatus.phase).toBe('idle');
    expect(state.lastInvestigationResult).toBe(null);
  });

  it('should handle error phase', () => {
    const status: GitLabInvestigationStatus = {
      phase: 'error',
      issueIid: 1,
      progress: 0,
      message: 'Investigation failed',
      error: 'Network error'
    };
    useInvestigationStore.getState().setInvestigationStatus(status);
    expect(useInvestigationStore.getState().investigationStatus.phase).toBe('error');
  });

  it('should handle creating_task phase', () => {
    const status: GitLabInvestigationStatus = {
      phase: 'creating_task',
      issueIid: 1,
      progress: 80,
      message: 'Creating task...'
    };
    useInvestigationStore.getState().setInvestigationStatus(status);
    expect(useInvestigationStore.getState().investigationStatus.phase).toBe('creating_task');
  });
});
