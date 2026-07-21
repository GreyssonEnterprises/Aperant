import { describe, expect, it } from 'vitest';

import { requiresIsolatedWorktree } from './codex-workspace-policy';

describe('Codex workspace policy', () => {
  it('requires an isolated worktree only for Codex subscription execution', () => {
    expect(requiresIsolatedWorktree('codex-app-server')).toBe(true);
    expect(requiresIsolatedWorktree('vercel')).toBe(false);
    expect(requiresIsolatedWorktree(undefined)).toBe(false);
  });
});
