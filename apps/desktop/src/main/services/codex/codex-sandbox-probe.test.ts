import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createCodexSandboxProbe } from './codex-sandbox-probe';

function capabilityContext() {
  return {
    executablePath: '/usr/local/bin/codex',
    executableIdentity: '/usr/local/bin/codex:dev=1:ino=2:mtime=3:size=4',
    runtimeVersion: '0.144.0',
    sessionEpoch: 'session-1',
    lifecycleGeneration: 0,
  };
}

const policy = {
  type: 'workspaceWrite' as const,
  networkAccess: false as const,
  writableRoots: ['/worktree'],
  excludeTmpdirEnvVar: true as const,
  excludeSlashTmp: true as const,
};

type MarkerName = 'allowed' | 'outside' | 'git' | 'completed';

function harness(results: Array<{
  exitCode: number;
  stdout: string;
  stderr: string;
  markers?: MarkerName[];
}>) {
  const existing = new Set<string>();
  const execute = vi.fn(async (_accountId: string, request: {
    command: string[];
    sandboxPolicy: typeof policy;
  }) => {
    const result = results.shift();
    if (!result) throw new Error('missing command result');
    const [allowed, outside, git, completed] = request.command.slice(-4) as string[];
    const markerPaths: Record<MarkerName, string> = { allowed, outside, git, completed };
    const markers = result.markers ?? (
      result.exitCode === 0 ? ['allowed', 'completed'] :
        result.exitCode === 10 ? [] : ['allowed']
    );
    for (const marker of markers) {
      existing.add(markerPaths[marker]);
    }
    return result;
  });
  const remove = vi.fn(async (target: string) => {
    existing.delete(target);
  });
  let context = capabilityContext();
  return {
    existing,
    execute,
    remove,
    setContext: (next: ReturnType<typeof capabilityContext>) => { context = next; },
    probe: createCodexSandboxProbe({
      platform: 'darwin',
      canonicalize: async (value) => value,
      getCapabilityContext: async () => context,
      execute,
      makeProbeRoots: async () => ({
        probeRoot: '/worktree/.aperant-probe',
        outsideRoot: '/outside',
        gitRoot: '/worktree/.git',
        allowedMarker: '/worktree/.aperant-probe/allowed-marker',
        outsideMarker: '/outside/denied-marker',
        gitMarker: '/worktree/.git/denied-marker',
      }),
      markerExists: async (target) => existing.has(target),
      remove,
      cleanupRoots: async () => { /* Synthetic roots need no filesystem cleanup. */ },
      touchExecutable: '/usr/bin/touch',
    }),
  };
}

describe('Codex sandbox capability probe', () => {
  it.each(['directory', 'gitdir-file'] as const)(
    'targets the actual worktree Git metadata when .git is a %s',
    async (gitKind) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-probe-boundary-'));
      const worktree = path.join(root, 'worktree');
      const gitDir = gitKind === 'directory'
        ? path.join(worktree, '.git')
        : path.join(root, 'actual-gitdir');
      await mkdir(worktree);
      await mkdir(gitDir);
      if (gitKind === 'gitdir-file') {
        await writeFile(path.join(worktree, '.git'), `gitdir: ${gitDir}\n`, { mode: 0o600 });
      }
      const targets: string[] = [];
      const execute = vi.fn(async (_accountId: string, request: { command: string[] }) => {
        const [allowed, outside, git, completed] = request.command.slice(-4) as string[];
        targets.push(allowed, outside, git, completed);
        await writeFile(allowed, '');
        await writeFile(completed, '');
        return { exitCode: 0, stdout: '', stderr: '' };
      });
      const probe = createCodexSandboxProbe({
        getCapabilityContext: async () => capabilityContext(),
        execute,
      });

      try {
        await probe.verify('account-a', worktree);
        const [, outsideMarker, gitMarker] = targets;
        const canonicalRoot = await realpath(root);
        const canonicalWorktree = await realpath(worktree);
        expect(path.dirname(path.dirname(outsideMarker as string))).toBe(canonicalRoot);
        expect(outsideMarker?.startsWith(`${canonicalWorktree}${path.sep}`)).toBe(false);
        expect(gitMarker?.startsWith(`${await realpath(gitDir)}${path.sep}`)).toBe(true);
      } finally {
        await rm(root, { recursive: true });
      }
    },
  );

  it('canonicalizes a symlinked worktree before choosing every probe boundary', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-probe-symlink-'));
    const realWorktree = path.join(root, 'real-worktree');
    const linkedWorktree = path.join(root, 'linked-worktree');
    await mkdir(path.join(realWorktree, '.git'), { recursive: true });
    await symlink(realWorktree, linkedWorktree);
    const targets: string[] = [];
    const probe = createCodexSandboxProbe({
      getCapabilityContext: async () => capabilityContext(),
      execute: async (_accountId, request) => {
        const [allowed, outside, git, completed] = request.command.slice(-4) as string[];
        targets.push(allowed, outside, git, completed);
        await writeFile(allowed, '');
        await writeFile(completed, '');
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    try {
      await probe.verify('account-a', linkedWorktree);
      const canonicalWorktree = await realpath(realWorktree);
      expect(targets[0]?.startsWith(`${canonicalWorktree}${path.sep}`)).toBe(true);
      expect(targets.every((target) => !target.startsWith(`${linkedWorktree}${path.sep}`))).toBe(true);
      expect(targets[2]?.startsWith(`${path.join(canonicalWorktree, '.git')}${path.sep}`))
        .toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('does not leave host-created probe directories when Git metadata cannot be resolved', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-probe-no-git-'));
    const worktree = path.join(root, 'worktree');
    await mkdir(worktree);
    const probe = createCodexSandboxProbe({
      getCapabilityContext: async () => capabilityContext(),
      execute: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    });

    try {
      await expect(probe.verify('account-a', worktree)).rejects.toBeDefined();
      expect(await readdir(worktree)).toEqual([]);
      expect((await readdir(root)).filter((entry) => entry.includes('sandbox-denied'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('removes stale Git probe markers before running a new capability check', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-probe-stale-git-'));
    const worktree = path.join(root, 'worktree');
    const gitRoot = path.join(worktree, '.git');
    await mkdir(gitRoot, { recursive: true });
    const stale = path.join(gitRoot, '.aperant-sandbox-probe-stale');
    await writeFile(stale, '');
    const probe = createCodexSandboxProbe({
      getCapabilityContext: async () => capabilityContext(),
      execute: async (_accountId, request) => {
        const [allowed, , , completed] = request.command.slice(-4) as string[];
        await writeFile(allowed, '');
        await writeFile(completed, '');
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    try {
      await probe.verify('account-a', worktree);
      await expect(realpath(stale)).rejects.toBeDefined();
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('proves allowed writes while rejecting outside and Git metadata writes', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
    ]);

    await fixture.probe.verify('account-a', '/worktree');

    expect(fixture.execute).toHaveBeenCalledTimes(1);
    for (const [, request] of fixture.execute.mock.calls) {
      expect(request.sandboxPolicy).toEqual(policy);
    }
    expect(fixture.execute.mock.calls[0]?.[1].command[0]).toBe('/bin/sh');
    expect(fixture.execute.mock.calls[0]?.[1].command.slice(-4)).toEqual([
      '/worktree/.aperant-probe/allowed-marker',
      '/outside/denied-marker',
      '/worktree/.git/denied-marker',
      '/worktree/.aperant-probe/completed-marker',
    ]);
    expect(fixture.remove).toHaveBeenCalledWith('/worktree/.aperant-probe/allowed-marker');
  });

  it('proves the complete sandbox boundary in one atomic command', async () => {
    const existing = new Set<string>();
    const execute = vi.fn(async (_accountId: string, request: { command: string[] }) => {
      const [allowedMarker, , , completedMarker] = request.command.slice(-4);
      existing.add(allowedMarker as string);
      existing.add(completedMarker as string);
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const probe = createCodexSandboxProbe({
      platform: 'darwin',
      canonicalize: async (value) => value,
      getCapabilityContext: async () => capabilityContext(),
      execute,
      makeProbeRoots: async () => ({
        probeRoot: '/worktree/.aperant-probe',
        outsideRoot: '/outside',
        gitRoot: '/worktree/.git',
        allowedMarker: '/worktree/.aperant-probe/allowed-marker',
        outsideMarker: '/outside/denied-marker',
        gitMarker: '/worktree/.git/denied-marker',
      }),
      markerExists: async (target) => existing.has(target),
      remove: async (target) => { existing.delete(target); },
      cleanupRoots: async () => { /* Synthetic roots need no filesystem cleanup. */ },
    });

    await probe.verify('account-a', '/worktree');

    expect(execute).toHaveBeenCalledTimes(1);
    const command = execute.mock.calls[0]?.[1].command;
    expect(command?.[0]).toBe('/bin/sh');
    expect(command?.[2]).toBe([
      'if ! "$1" "$3"; then exit 10; fi;',
      'if "$1" "$4"; then "$2" -f -- "$4"; exit 11; fi;',
      'if "$1" "$5"; then "$2" -f -- "$5"; exit 12; fi;',
      'if ! "$1" "$6"; then exit 13; fi',
    ].join(' '));
    expect(command?.slice(-4)).toEqual([
      '/worktree/.aperant-probe/allowed-marker',
      '/outside/denied-marker',
      '/worktree/.git/denied-marker',
      '/worktree/.aperant-probe/completed-marker',
    ]);
  });

  it('probes the exact writable roots used by execution', async () => {
    const existing = new Set<string>();
    const execute = vi.fn(async (_accountId: string, request: {
      command: string[];
      sandboxPolicy: typeof policy;
    }) => {
      const [allowed, , , completed] = request.command.slice(-4) as string[];
      existing.add(allowed);
      existing.add(completed);
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const probe = createCodexSandboxProbe({
      platform: 'darwin',
      canonicalize: async (value) => value,
      getCapabilityContext: async () => capabilityContext(),
      execute,
      makeProbeRoots: async () => ({
        probeRoot: '/worktree/output/.aperant-probe',
        outsideRoot: '/outside',
        gitRoot: '/worktree/.git',
        allowedMarker: '/worktree/output/.aperant-probe/allowed-marker',
        outsideMarker: '/outside/denied-marker',
        gitMarker: '/worktree/.git/denied-marker',
      }),
      markerExists: async (target) => existing.has(target),
      remove: async (target) => { existing.delete(target); },
      cleanupRoots: async () => { /* Synthetic roots need no filesystem cleanup. */ },
      touchExecutable: '/usr/bin/touch',
    });

    await (probe.verify as (
      accountId: string,
      worktree: string,
      writableRoots: string[],
    ) => Promise<void>)('account-a', '/worktree', ['/worktree/output']);

    for (const [, request] of execute.mock.calls) {
      expect(request.sandboxPolicy.writableRoots).toEqual(['/worktree/output']);
    }
    expect(execute.mock.calls[0]?.[1].command.slice(-4)).toEqual([
      '/worktree/output/.aperant-probe/allowed-marker',
      '/outside/denied-marker',
      '/worktree/.git/denied-marker',
      '/worktree/output/.aperant-probe/completed-marker',
    ]);
  });

  it.each([
    ['allowed write fails', 10],
    ['outside write succeeds', 11],
    ['Git metadata write succeeds', 12],
    ['completion checkpoint fails', 13],
  ])('fails closed when %s', async (_name, exitCode) => {
    const fixture = harness([{ exitCode, stdout: '', stderr: '' }]);
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox enforcement could not be proven');
  });

  it('fails closed and cleans up when a forbidden marker exists', async () => {
    const fixture = harness([
      {
        exitCode: 11,
        stdout: '',
        stderr: '',
        markers: ['allowed', 'outside'],
      },
    ]);
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox enforcement could not be proven');
    expect(fixture.remove).toHaveBeenCalledWith('/outside/denied-marker');
    expect(fixture.existing.has('/outside/denied-marker')).toBe(false);
  });

  it('fails closed when cleanup fails and does not cache the result', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ]);
    fixture.remove.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox probe cleanup failed');
    await fixture.probe.verify('account-a', '/worktree');
    expect(fixture.execute).toHaveBeenCalledTimes(2);
  });

  it('uses a self-cleaning argv helper for denied writes that unexpectedly succeed', async () => {
    const fixture = harness([
      { exitCode: 11, stdout: '', stderr: '' },
    ]);
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox enforcement could not be proven');

    const command = fixture.execute.mock.calls[0]?.[1].command;
    expect(command?.[0]).toBe('/bin/sh');
    expect(command?.slice(-4)).toContain('/outside/denied-marker');
    expect(fixture.existing.has('/outside/denied-marker')).toBe(false);
  });

  it('fails with cleanup error when an unexpected denied marker cannot be removed', async () => {
    const fixture = harness([
      {
        exitCode: 11,
        stdout: '',
        stderr: '',
        markers: ['allowed', 'outside'],
      },
    ]);
    fixture.remove.mockImplementation(async (target: string) => {
      if (target === '/outside/denied-marker') throw new Error('host cleanup failed');
      fixture.existing.delete(target);
    });
    await expect(fixture.probe.verify('account-a', '/worktree'))
      .rejects.toThrow('Codex sandbox probe cleanup failed');
    expect(fixture.remove).toHaveBeenCalledWith('/outside/denied-marker');
  });

  it('caches a pass by runtime version, platform, account, and canonical worktree', async () => {
    const fixture = harness([
      { exitCode: 0, stdout: '', stderr: '' },
    ]);
    await fixture.probe.verify('account-a', path.normalize('/worktree'));
    await fixture.probe.verify('account-a', path.normalize('/worktree'));
    expect(fixture.execute).toHaveBeenCalledTimes(1);
  });

  it('re-probes on binary, session, lifecycle, and explicit account invalidation', async () => {
    const result = (exitCode: number) => ({ exitCode, stdout: '', stderr: '' });
    const fixture = harness(Array.from({ length: 5 }, () => result(0)));
    const first = capabilityContext();
    await fixture.probe.verify('account-a', '/worktree');

    fixture.setContext({ ...first, executableIdentity: `${first.executablePath}:replacement` });
    await fixture.probe.verify('account-a', '/worktree');
    fixture.setContext({ ...first, sessionEpoch: 'session-2' });
    await fixture.probe.verify('account-a', '/worktree');
    fixture.setContext({ ...first, lifecycleGeneration: 1 });
    await fixture.probe.verify('account-a', '/worktree');
    fixture.probe.invalidateAccount('account-a');
    await fixture.probe.verify('account-a', '/worktree');

    expect(fixture.execute).toHaveBeenCalledTimes(5);
  });

  it('rejects unsupported platforms without executing a command', async () => {
    const fixture = harness([]);
    const unsupported = createCodexSandboxProbe({
      platform: 'win32',
      canonicalize: async (value) => value,
      getCapabilityContext: async () => capabilityContext(),
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
      await mkdir(path.join(worktree, '.git'), { recursive: true, mode: 0o700 });
      const manager = createCodexAppServerManager({
        codexHomeRoot: path.join(root, 'accounts'),
        clientVersion: 'sandbox-probe-smoke',
      });
      const probe = createCodexSandboxProbe({
        getCapabilityContext: (accountId) => manager.getSandboxCapabilityContext(accountId),
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

  it.runIf(!!process.env.APERANT_CODEX_SANDBOX_WORKTREE)(
    'proves the installed native Codex sandbox in a supplied worktree',
    async () => {
      const [{ createCodexAppServerManager }] = await Promise.all([
        import('./codex-app-server-manager'),
      ]);
      const root = await mkdtemp(path.join(os.tmpdir(), 'aperant-codex-probe-real-'));
      const manager = createCodexAppServerManager({
        codexHomeRoot: path.join(root, 'accounts'),
        clientVersion: 'sandbox-probe-real-worktree',
      });
      const probe = createCodexSandboxProbe({
        getCapabilityContext: (accountId) => manager.getSandboxCapabilityContext(accountId),
        execute: (accountId, request) => manager.executeSandboxCommand(accountId, request),
      });
      try {
        const worktree = process.env.APERANT_CODEX_SANDBOX_WORKTREE as string;
        const writableRoot = process.env.APERANT_CODEX_SANDBOX_WRITABLE_ROOT;
        await expect(probe.verify(
          'smoke-account',
          worktree,
          writableRoot ? [writableRoot] : [worktree],
        )).resolves.toBeUndefined();
      } finally {
        await manager.shutdown();
        await rm(root, { recursive: true });
      }
    },
    30_000,
  );
});
