import { describe, expect, it } from 'vitest';
import {
  buildCodexWorkspaceWritePolicy,
  hashCodexWorkspaceWritePolicy,
} from './codex-sandbox-policy';

describe('Codex workspace-write policy', () => {
  it('builds the exact fail-closed policy shared by turns and capability probes', () => {
    expect(buildCodexWorkspaceWritePolicy(['/worktree', '/worktree/specs'])).toEqual({
      type: 'workspaceWrite',
      networkAccess: false,
      writableRoots: ['/worktree', '/worktree/specs'],
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    });
  });

  it('copies writable roots so callers cannot mutate the policy through their input', () => {
    const roots = ['/worktree'];
    const policy = buildCodexWorkspaceWritePolicy(roots);
    roots.push('/escape');
    expect(policy.writableRoots).toEqual(['/worktree']);
  });

  it('changes the policy hash when writable roots change', () => {
    const first = buildCodexWorkspaceWritePolicy(['/worktree']);
    const second = buildCodexWorkspaceWritePolicy(['/worktree/specs']);
    expect(hashCodexWorkspaceWritePolicy(first)).not.toBe(hashCodexWorkspaceWritePolicy(second));
  });
});
