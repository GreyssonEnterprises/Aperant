import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createCodexSandboxProbe } from './codex-sandbox-probe';

const policy = {
  type: 'workspaceWrite' as const,
  networkAccess: false as const,
  writableRoots: ['/worktree/.aperant-probe'],
  excludeTmpdirEnvVar: true as const,
  excludeSlashTmp: true as const,
};

function harness(results: Array<{ exitCode: number; stdout: string; stderr: string }>) {
  const existing = new Set<string>();
  const execute = vi.fn(async (_accountId: string, request: {
    command: string[];
    sandboxPolicy: typeof policy;
  }) => {
    const result = results.shift();
    if (!result) throw new Error('missing command result');
    if (result.exitCode === 0) existing.add(request.command[1] as string);
    return result;
  });
  const remove = vi.fn(async (target: string) => {
    existing.delete(target);
  });
  return {
    existing,
    execute,
    remove,
    probe: createCodexSandboxProbe({
      platform: 'darwin',
      canonicalize: async (value) => value,
      getRuntimeVersion: async () => '0.144.0',
      execute,
      makeProbeRoots: async () => ({
        probeRoot: '/worktree/.aperant-probe',
        allowedMarker: '/worktree/.aperant-probe/allowed-marker',
        outsideMarker: '/outside/denied-marker',
        gitMarker: '/worktree/.aperant-probe/.git/denied-marker',
      }),
      markerExists: async (target) => existing.has(target),
      remove,
      cleanupRoots: async () => { /* Synthetic roots need no filesystem cleanup. */ },
      touchExecutable: '/usr/bin/touch',
    }),
  };
}

describe('Codex sandbox capability probe', () => {
  it('proves allowed writes while rejecting outside and Git metadata writes', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: 'denied' },
      { exitCode: 1, stdout: '', stderr: 'denied' },
    ]);

    await fixture.probe.verify('account-a', '/worktree');

    expect(fixture.execute).toHaveBeenCalledTimes(3);
    for (const [, request] of fixture.execute.mock.calls) {
      expect(request.sandboxPolicy).toEqual(policy);
      expect(request.command[0]).toBe('/usr/bin/touch');
      expect(request.command).toHaveLength(2);
    }
    expect(fixture.remove).toHaveBeenCalledWith('/worktree/.aperant-probe/allowed-marker');
  });

  it.each([
    ['allowed write fails', [1, 1, 1]],
    ['outside write succeeds', [0, 0, 1]],
    ['Git metadata write succeeds', [0, 1, 0]],
  ])('fails closed when %s', async (_name, exitCodes) => {
    const fixture = harness(exitCodes.map((exitCode) => ({ exitCode, stdout: '', stderr: '' })));
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox enforcement could not be proven');
  });

  it('fails closed when a denied marker appears despite a nonzero exit', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
    ]);
    fixture.existing.add('/outside/denied-marker');
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox enforcement could not be proven');
  });

  it('fails closed when cleanup fails and does not cache the result', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
    ]);
    fixture.remove.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox probe cleanup failed');
    await fixture.probe.verify('account-a', '/worktree');
    expect(fixture.execute).toHaveBeenCalledTimes(6);
  });

  it('caches a pass by runtime version, platform, account, and canonical worktree', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: '' },
    ]);
    await fixture.probe.verify('account-a', path.normalize('/worktree'));
    await fixture.probe.verify('account-a', path.normalize('/worktree'));
    expect(fixture.execute).toHaveBeenCalledTimes(3);
  });

  it('rejects unsupported platforms without executing a command', async () => {
    const fixture = harness([]);
    const unsupported = createCodexSandboxProbe({
      platform: 'win32',
      canonicalize: async (value) => value,
      getRuntimeVersion: async () => '0.144.0',
      execute: fixture.execute,
      makeProbeRoots: async () => {
        throw new Error('unreachable');
      },
      markerExists: async () => false,
      remove: fixture.remove,
      cleanupRoots: async () => { /* Synthetic roots need no filesystem cleanup. */ },
      touchExecutable: 'touch',
    });
    await expect(unsupported.verify('account-a', 'C:\\worktree'))
      .rejects.toThrow('Codex sandbox verification is unavailable on this platform');
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it.runIf(process.env.APERANT_CODEX_SANDBOX_SMOKE === '1')(
    'proves the installed native Codex sandbox without the default CODEX_HOME or OAuth',
    async () => {
      const [{ createCodexAppServerManager }] = await Promise.all([
        import('./codex-app-server-manager'),
      ]);
      const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-codex-probe-smoke-'));
      const worktree = path.join(root, 'worktree');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(worktree, { mode: 0o700 });
      const manager = createCodexAppServerManager({
        codexHomeRoot: path.join(root, 'accounts'),
        clientVersion: 'sandbox-probe-smoke',
      });
      const probe = createCodexSandboxProbe({
        getRuntimeVersion: (accountId) => manager.getSandboxRuntimeVersion(accountId),
        execute: (accountId, request) => manager.executeSandboxCommand(accountId, request),
      });
      try {
        await expect(probe.verify('smoke-account', worktree)).resolves.toBeUndefined();
      } finally {
        await manager.shutdown();
        await rm(root, { recursive: true });
      }
    },
    30_000,
  );
});
