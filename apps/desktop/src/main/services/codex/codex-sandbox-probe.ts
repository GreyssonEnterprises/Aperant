import { access, mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexRuntimeError } from './codex-errors';

export interface CodexSandboxCommand {
  command: string[];
  cwd: string;
  timeoutMs: number;
  outputBytesCap: number;
  sandboxPolicy: {
    type: 'workspaceWrite';
    networkAccess: false;
    writableRoots: string[];
    excludeTmpdirEnvVar: true;
    excludeSlashTmp: true;
  };
}

export interface CodexSandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ProbeRoots {
  probeRoot: string;
  allowedMarker: string;
  outsideMarker: string;
  gitMarker: string;
  outsideRoot?: string;
}

interface Dependencies {
  platform: NodeJS.Platform;
  canonicalize(value: string): Promise<string>;
  getRuntimeVersion(accountId: string): Promise<string>;
  execute(accountId: string, request: CodexSandboxCommand): Promise<CodexSandboxCommandResult>;
  makeProbeRoots(worktree: string): Promise<ProbeRoots>;
  markerExists(target: string): Promise<boolean>;
  remove(target: string): Promise<void>;
  cleanupRoots?(roots: ProbeRoots): Promise<void>;
  touchExecutable: string;
}

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_OUTPUT_BYTES = 4_096;

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function makeProbeRoots(worktree: string): Promise<ProbeRoots> {
  const probeRoot = await mkdtemp(path.join(worktree, '.aperant-codex-sandbox-probe-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'aperant-codex-denied-'));
  await mkdir(path.join(probeRoot, '.git'), { mode: 0o700 });
  return {
    probeRoot,
    outsideRoot,
    allowedMarker: path.join(probeRoot, 'allowed-marker'),
    outsideMarker: path.join(outsideRoot, 'denied-marker'),
    gitMarker: path.join(probeRoot, '.git', 'denied-marker'),
  };
}

async function cleanupRoots(roots: ProbeRoots): Promise<void> {
  await rm(roots.probeRoot, { recursive: true });
  if (roots.outsideRoot) await rm(roots.outsideRoot, { recursive: true });
}

export function createCodexSandboxProbe(overrides?: Partial<Dependencies>) {
  const dependencies: Dependencies = {
    platform: process.platform,
    canonicalize: async (value) => (await import('node:fs/promises')).realpath(value),
    getRuntimeVersion: async () => {
      throw new Error('Codex runtime version dependency is required');
    },
    execute: async () => {
      throw new Error('Codex command execution dependency is required');
    },
    makeProbeRoots,
    markerExists: exists,
    remove: unlink,
    cleanupRoots,
    touchExecutable: process.platform === 'darwin' ? '/usr/bin/touch' : '/bin/touch',
    ...overrides,
  };
  const passed = new Set<string>();

  async function verify(accountId: string, worktree: string): Promise<void> {
    if (dependencies.platform !== 'darwin' && dependencies.platform !== 'linux') {
      throw new CodexRuntimeError(
        'platform-unsupported',
        'Codex sandbox verification is unavailable on this platform',
      );
    }
    const canonicalWorktree = await dependencies.canonicalize(worktree);
    const runtimeVersion = await dependencies.getRuntimeVersion(accountId);
    const cacheKey = [dependencies.platform, runtimeVersion, accountId, canonicalWorktree].join('\0');
    if (passed.has(cacheKey)) return;

    const roots = await dependencies.makeProbeRoots(canonicalWorktree);
    const sandboxPolicy = {
      type: 'workspaceWrite' as const,
      networkAccess: false as const,
      writableRoots: [roots.probeRoot],
      excludeTmpdirEnvVar: true as const,
      excludeSlashTmp: true as const,
    };
    const runTouch = (target: string) => dependencies.execute(accountId, {
      command: [dependencies.touchExecutable, target],
      cwd: roots.probeRoot,
      timeoutMs: PROBE_TIMEOUT_MS,
      outputBytesCap: PROBE_OUTPUT_BYTES,
      sandboxPolicy,
    });

    let verified = false;
    let allowedMarkerCreated = false;
    let probeFailure: unknown;
    try {
      const allowed = await runTouch(roots.allowedMarker);
      allowedMarkerCreated = await dependencies.markerExists(roots.allowedMarker);
      const outside = await runTouch(roots.outsideMarker);
      const outsideCreated = await dependencies.markerExists(roots.outsideMarker);
      const git = await runTouch(roots.gitMarker);
      const gitCreated = await dependencies.markerExists(roots.gitMarker);
      verified = allowed.exitCode === 0 && allowedMarkerCreated &&
        outside.exitCode !== 0 && !outsideCreated && git.exitCode !== 0 && !gitCreated;
      if (!verified) {
        throw new CodexRuntimeError(
          'isolation-failed',
          'Codex sandbox enforcement could not be proven',
        );
      }
      try {
        await dependencies.remove(roots.allowedMarker);
        allowedMarkerCreated = false;
      } catch {
        throw new CodexRuntimeError(
          'isolation-failed',
          'Codex sandbox probe cleanup failed',
        );
      }
    } catch (error) {
      probeFailure = error;
    }
    try {
      if (allowedMarkerCreated) await dependencies.remove(roots.allowedMarker);
      await dependencies.cleanupRoots?.(roots);
    } catch {
      throw new CodexRuntimeError(
        'isolation-failed',
        'Codex sandbox probe cleanup failed',
      );
    }
    if (probeFailure) throw probeFailure;
    if (verified) passed.add(cacheKey);
  }

  return { verify };
}

export type CodexSandboxProbe = ReturnType<typeof createCodexSandboxProbe>;
