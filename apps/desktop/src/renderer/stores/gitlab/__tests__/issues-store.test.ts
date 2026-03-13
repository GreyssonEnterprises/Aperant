/**
 * Unit tests for GitLab issues store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useIssuesStore } from '../issues-store';
import type { GitLabIssue } from '../../../../shared/types';

/**
 * Mock factory for GitLab issues
 * Follows existing codebase pattern from github-prs/hooks/__tests__
 */
function createMockGitLabIssue(overrides: Partial<GitLabIssue> = {}): GitLabIssue {
  return {
    id: 1,
    iid: 1,
    title: 'Test Issue',
    description: 'Test description',
    state: 'opened',
    labels: [],
    assignees: [],
    author: { username: 'testuser', avatarUrl: '' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    webUrl: 'https://gitlab.com/test/project/issues/1',
    projectPathWithNamespace: 'test/project',
    userNotesCount: 0,
    ...overrides,
  };
}

describe('issues-store', () => {
  beforeEach(() => {
    useIssuesStore.getState().clearIssues();
  });

  it('should initialize with empty state', () => {
    const state = useIssuesStore.getState();
    expect(state.issues).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe(null);
  });

  it('should set issues', () => {
    const issues = [createMockGitLabIssue({ iid: 1, title: 'Test' })];
    useIssuesStore.getState().setIssues(issues);
    expect(useIssuesStore.getState().issues).toHaveLength(1);
  });

  it('should replace issues with new array', () => {
    const issue1 = createMockGitLabIssue({ iid: 1, title: 'Test 1' });
    const issue2 = createMockGitLabIssue({ iid: 2, title: 'Test 2' });

    useIssuesStore.getState().setIssues([issue1]);
    useIssuesStore.getState().setIssues([...useIssuesStore.getState().issues, issue2]);

    expect(useIssuesStore.getState().issues).toHaveLength(2);
  });

  it('should update issue', () => {
    const issue = createMockGitLabIssue({ iid: 1, state: 'opened' });
    useIssuesStore.getState().setIssues([issue]);
    useIssuesStore.getState().updateIssue(1, { state: 'closed' });

    const updated = useIssuesStore.getState().issues[0];
    expect(updated.state).toBe('closed');
  });

  it('should get filtered issues', () => {
    const issues = [
      createMockGitLabIssue({ iid: 1, state: 'opened' }),
      createMockGitLabIssue({ iid: 2, state: 'closed' }),
      createMockGitLabIssue({ iid: 3, state: 'opened' }),
    ];
    useIssuesStore.getState().setIssues(issues);
    useIssuesStore.getState().setFilterState('opened');

    const filtered = useIssuesStore.getState().getFilteredIssues();
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i: GitLabIssue) => i.state === 'opened')).toBe(true);
  });

  it('should get selected issue', () => {
    const issue = createMockGitLabIssue({ iid: 1, title: 'Test' });
    useIssuesStore.getState().setIssues([issue]);
    useIssuesStore.getState().selectIssue(1);

    const selected = useIssuesStore.getState().getSelectedIssue();
    expect(selected?.iid).toBe(1);
  });

  it('should count open issues', () => {
    const issues = [
      createMockGitLabIssue({ iid: 1, state: 'opened' }),
      createMockGitLabIssue({ iid: 2, state: 'closed' }),
      createMockGitLabIssue({ iid: 3, state: 'opened' }),
    ];
    useIssuesStore.getState().setIssues(issues);

    expect(useIssuesStore.getState().getOpenIssuesCount()).toBe(2);
  });

  it('should reset selection', () => {
    useIssuesStore.getState().selectIssue(1);
    expect(useIssuesStore.getState().selectedIssueIid).toBe(1);

    useIssuesStore.getState().selectIssue(null);
    expect(useIssuesStore.getState().selectedIssueIid).toBe(null);
  });
});
