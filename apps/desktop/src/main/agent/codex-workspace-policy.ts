export function requiresIsolatedWorktree(
  executionBackend: 'vercel' | 'codex-app-server' | undefined,
): boolean {
  return executionBackend === 'codex-app-server';
}
