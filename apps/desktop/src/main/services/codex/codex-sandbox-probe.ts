import { randomUUID } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, readdir, realpath, rm, unlink } from 'node:fs/promises';
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
  makeProbeRoots(worktree: string, writableRoot: string): Promise<ProbeRoots>;
  markerExists(target: string): Promise<boolean>;
  remove(target: string): Promise<void>;
  cleanupRoots?(roots: ProbeRoots): Promise<void>;
  touchExecutable: string;
  shellExecutable: string;
  removeExecutable: string;
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

async function makeProbeRoots(worktree: string, writableRoot: string): Promise<ProbeRoots> {
  const gitRoot = await resolveGitRoot(worktree);
  try {
    for (const entry of await readdir(gitRoot)) {
      if (entry.startsWith('.aperant-sandbox-probe-')) {
        await unlink(path.join(gitRoot, entry));
      }
    }
  } catch {
    throw new CodexRuntimeError('isolation-failed');
  }
  const probeRoot = await mkdtemp(path.join(writableRoot, '.aperant-codex-sandbox-probe-'));
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

function isContainedOrEqual(root: string, candidate: string): boolean {
  return root === candidate || isContained(root, candidate);
}

function validateProbeRoots(
  worktree: string,
  writableRoots: readonly string[],
  roots: ProbeRoots,
): void {
  if (!writableRoots.some((root) => isContained(root, roots.probeRoot)) ||
    writableRoots.some((root) => !isContainedOrEqual(worktree, root)) ||
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
    shellExecutable: '/bin/sh',
    removeExecutable: '/bin/rm',
    ...overrides,
  };
  const passed = new Map<string, string>();

  async function verify(
    accountId: string,
    worktree: string,
    writableRoots: readonly string[] = [worktree],
  ): Promise<void> {
    if (dependencies.platform !== 'darwin' && dependencies.platform !== 'linux') {
      throw new CodexRuntimeError(
        'platform-unsupported',
        'Codex sandbox verification is unavailable on this platform',
      );
    }
    const canonicalWorktree = await dependencies.canonicalize(worktree);
    if (writableRoots.length < 1 || writableRoots.length > 8) {
      throw new CodexRuntimeError('isolation-failed');
    }
    const canonicalWritableRoots = [...new Set(await Promise.all(
      writableRoots.map((root) => dependencies.canonicalize(root)),
    ))];
    if (canonicalWritableRoots.some(
      (root) => !isContainedOrEqual(canonicalWorktree, root),
    )) {
      throw new CodexRuntimeError('isolation-failed');
    }
    const sandboxPolicy = buildCodexWorkspaceWritePolicy(canonicalWritableRoots);
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
    const roots = await dependencies.makeProbeRoots(
      canonicalWorktree,
      canonicalWritableRoots[0] as string,
    );
    validateProbeRoots(canonicalWorktree, canonicalWritableRoots, roots);
    const completedMarker = path.join(roots.probeRoot, 'completed-marker');
    if (!isContained(roots.probeRoot, completedMarker)) {
      throw new CodexRuntimeError('isolation-failed');
    }

    let verified = false;
    let probeFailure: unknown;
    try {
      const result = await dependencies.execute(accountId, {
        command: [
          dependencies.shellExecutable,
          '-c',
          [
            'if ! "$1" "$3"; then exit 10; fi;',
            'if "$1" "$4"; then "$2" -f -- "$4"; exit 11; fi;',
            'if "$1" "$5"; then "$2" -f -- "$5"; exit 12; fi;',
            'if ! "$1" "$6"; then exit 13; fi',
          ].join(' '),
          'aperant-sandbox-boundary-probe',
          dependencies.touchExecutable,
          dependencies.removeExecutable,
          roots.allowedMarker,
          roots.outsideMarker,
          roots.gitMarker,
          completedMarker,
        ],
        cwd: roots.probeRoot,
        timeoutMs: PROBE_TIMEOUT_MS,
        outputBytesCap: PROBE_OUTPUT_BYTES,
        sandboxPolicy,
      });
      const [allowedCreated, outsideCreated, gitCreated, completed] = await Promise.all([
        dependencies.markerExists(roots.allowedMarker),
        dependencies.markerExists(roots.outsideMarker),
        dependencies.markerExists(roots.gitMarker),
        dependencies.markerExists(completedMarker),
      ]);
      verified = result.exitCode === 0 && allowedCreated && completed &&
        !outsideCreated && !gitCreated;
      if (!verified) {
        throw new CodexRuntimeError(
          'isolation-failed',
          'Codex sandbox enforcement could not be proven',
        );
      }
    } catch (error) {
      probeFailure = error;
    }
    try {
      for (const marker of [
        roots.allowedMarker,
        roots.outsideMarker,
        roots.gitMarker,
        completedMarker,
      ]) {
        if (await dependencies.markerExists(marker)) await dependencies.remove(marker);
        if (await dependencies.markerExists(marker)) throw new Error('marker remains');
      }
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
