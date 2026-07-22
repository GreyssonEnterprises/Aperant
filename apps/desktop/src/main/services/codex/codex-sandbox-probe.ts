import { randomUUID } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, realpath, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { CodexRuntimeError } from './codex-errors';
import {
  buildCodexWorkspaceWritePolicy,
  hashCodexWorkspaceWritePolicy,
  type CodexWorkspaceWritePolicy,
} from './codex-sandbox-policy';
import type { CodexSandboxCapabilityContext } from './codex-app-server-manager';

export interface CodexSandboxCommand {
  command: string[];
  cwd: string;
  timeoutMs: number;
  outputBytesCap: number;
  sandboxPolicy: CodexWorkspaceWritePolicy;
}

export interface CodexSandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ProbeRoots {
  probeRoot: string;
  outsideRoot: string;
  gitRoot: string;
  allowedMarker: string;
  outsideMarker: string;
  gitMarker: string;
}

interface Dependencies {
  platform: NodeJS.Platform;
  canonicalize(value: string): Promise<string>;
  getCapabilityContext(accountId: string): Promise<CodexSandboxCapabilityContext>;
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

async function resolveGitRoot(worktree: string): Promise<string> {
  const dotGit = path.join(worktree, '.git');
  try {
    const dotGitStat = await lstat(dotGit);
    if (dotGitStat.isDirectory()) return await realpath(dotGit);
    if (dotGitStat.isFile() && dotGitStat.size <= 4_096) {
      const pointer = await readFile(dotGit, 'utf8');
      const match = /^gitdir:\s*([^\r\n]+)\s*\r?\n?$/.exec(pointer);
      if (match?.[1]) return await realpath(path.resolve(worktree, match[1]));
    }
  } catch {
    // Normalize filesystem details at this trust boundary.
  }
  throw new CodexRuntimeError('isolation-failed');
}

async function makeProbeRoots(worktree: string): Promise<ProbeRoots> {
  const gitRoot = await resolveGitRoot(worktree);
  const probeRoot = await mkdtemp(path.join(worktree, '.aperant-codex-sandbox-probe-'));
  let outsideRoot: string;
  try {
    outsideRoot = await mkdtemp(path.join(
      path.dirname(worktree),
      '.aperant-codex-sandbox-denied-',
    ));
  } catch {
    try {
      await rm(probeRoot, { recursive: true });
    } catch {
      throw new CodexRuntimeError('isolation-failed');
    }
    throw new CodexRuntimeError('isolation-failed');
  }
  return {
    probeRoot,
    outsideRoot,
    gitRoot,
    allowedMarker: path.join(probeRoot, 'allowed-marker'),
    outsideMarker: path.join(outsideRoot, 'denied-marker'),
    gitMarker: path.join(gitRoot, `.aperant-sandbox-probe-${randomUUID()}`),
  };
}

async function cleanupRoots(roots: ProbeRoots): Promise<void> {
  for (const marker of [roots.allowedMarker, roots.outsideMarker, roots.gitMarker]) {
    if (await exists(marker)) await unlink(marker);
  }
  await rm(roots.probeRoot, { recursive: true });
  await rm(roots.outsideRoot, { recursive: true });
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function validateProbeRoots(worktree: string, roots: ProbeRoots): void {
  if (!isContained(worktree, roots.probeRoot) ||
    !isContained(roots.probeRoot, roots.allowedMarker) ||
    path.dirname(roots.outsideRoot) !== path.dirname(worktree) ||
    roots.outsideRoot === worktree || isContained(worktree, roots.outsideRoot) ||
    !isContained(roots.outsideRoot, roots.outsideMarker) ||
    !isContained(roots.gitRoot, roots.gitMarker)) {
    throw new CodexRuntimeError('isolation-failed');
  }
}

export function createCodexSandboxProbe(overrides?: Partial<Dependencies>) {
  const dependencies: Dependencies = {
    platform: process.platform,
    canonicalize: realpath,
    getCapabilityContext: async () => {
      throw new Error('Codex sandbox capability context dependency is required');
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
  const passed = new Map<string, string>();

  async function verify(accountId: string, worktree: string): Promise<void> {
    if (dependencies.platform !== 'darwin' && dependencies.platform !== 'linux') {
      throw new CodexRuntimeError(
        'platform-unsupported',
        'Codex sandbox verification is unavailable on this platform',
      );
    }
    const canonicalWorktree = await dependencies.canonicalize(worktree);
    const sandboxPolicy = buildCodexWorkspaceWritePolicy([canonicalWorktree]);
    const capability = await dependencies.getCapabilityContext(accountId);
    if (!capability.executablePath || !capability.executableIdentity ||
      !capability.runtimeVersion || !capability.sessionEpoch ||
      !Number.isSafeInteger(capability.lifecycleGeneration) ||
      capability.lifecycleGeneration < 0) {
      throw new CodexRuntimeError('isolation-failed');
    }
    const cacheKey = JSON.stringify([
      dependencies.platform,
      capability.executablePath,
      capability.executableIdentity,
      capability.runtimeVersion,
      capability.sessionEpoch,
      capability.lifecycleGeneration,
      accountId,
      canonicalWorktree,
      hashCodexWorkspaceWritePolicy(sandboxPolicy),
    ]);
    if (passed.has(cacheKey)) return;
    const roots = await dependencies.makeProbeRoots(canonicalWorktree);
    validateProbeRoots(canonicalWorktree, roots);
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
    if (verified) {
      if (passed.size >= 128) {
        const oldest = passed.keys().next().value;
        if (oldest) passed.delete(oldest);
      }
      passed.set(cacheKey, accountId);
    }
  }

  return {
    verify,
    invalidateAccount(accountId: string) {
      for (const [key, owner] of passed) {
        if (owner === accountId) passed.delete(key);
      }
    },
    invalidateAll() {
      passed.clear();
    },
  };
}

export type CodexSandboxProbe = ReturnType<typeof createCodexSandboxProbe>;
