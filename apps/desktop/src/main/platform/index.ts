/**
 * Platform Abstraction Layer
 *
 * Centralized platform-specific operations. All code that checks
 * process.platform or handles OS differences should go here.
 *
 * Design principles:
 * - Single source of truth for platform detection
 * - Feature detection over platform detection when possible
 * - Clear, intention-revealing names
 * - Immutable configurations
 */

import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { OS, ShellType, PathConfig, ShellConfig, BinaryDirectories } from './types';
import { getTaskkillExePath, getTrustedTaskkillExePath } from '../utils/windows-paths';

// Re-export from paths.ts for backward compatibility
export { getWindowsShellPaths, getOllamaExecutablePaths, getOllamaInstallCommand, getWhichCommand } from './paths';

/**
 * Get the current operating system
 *
 * Returns the OS enum if running on a supported platform (Windows, macOS, Linux),
 * otherwise defaults to Linux for other Unix-like systems (e.g., FreeBSD, SunOS).
 */
export function getCurrentOS(): OS {
  const platform = process.platform;
  if (platform === OS.Windows || platform === OS.macOS || platform === OS.Linux) {
    return platform as OS;
  }
  // Default to Linux for other Unix-like systems
  return OS.Linux;
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === OS.Windows;
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === OS.macOS;
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === OS.Linux;
}

/**
 * Check if running on a Unix-like system (macOS or Linux)
 */
export function isUnix(): boolean {
  return !isWindows();
}

/**
 * Get path configuration for the current platform
 */
export function getPathConfig(): PathConfig {
  if (isWindows()) {
    return {
      separator: path.sep,
      delimiter: ';',
      executableExtensions: ['.exe', '.cmd', '.bat', '.ps1']
    };
  }

  return {
    separator: path.sep,
    delimiter: ':',
    executableExtensions: ['']
  };
}

/**
 * Get the path separator for environment variables
 */
export function getPathDelimiter(): string {
  return isWindows() ? ';' : ':';
}

/**
 * Get the default file extension for executables
 */
export function getExecutableExtension(): string {
  return isWindows() ? '.exe' : '';
}

/**
 * Add executable extension to a base name if needed
 */
export function withExecutableExtension(baseName: string): string {
  // Handle empty string - return unchanged
  if (!baseName) return baseName;

  const ext = path.extname(baseName);
  if (ext) return baseName;

  const exeExt = getExecutableExtension();
  return exeExt ? `${baseName}${exeExt}` : baseName;
}

/**
 * Get common binary directories for the current platform
 */
export function getBinaryDirectories(): BinaryDirectories {
  const homeDir = os.homedir();

  if (isWindows()) {
    return {
      user: [
        path.join(homeDir, 'AppData', 'Local', 'Programs'),
        path.join(homeDir, 'AppData', 'Roaming', 'npm'),
        path.join(homeDir, '.local', 'bin')
      ],
      system: [
        process.env.ProgramFiles || 'C:\\Program Files',
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
      ]
    };
  }

  if (isMacOS()) {
    return {
      user: [
        path.join(homeDir, '.local', 'bin'),
        path.join(homeDir, 'bin')
      ],
      system: [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin'
      ]
    };
  }

  // Linux
  return {
    user: [
      path.join(homeDir, '.local', 'bin'),
      path.join(homeDir, 'bin')
    ],
    system: [
      '/usr/bin',
      '/usr/local/bin',
      '/snap/bin'
    ]
  };
}

/**
 * Get Homebrew binary directory (macOS only)
 */
export function getHomebrewPath(): string | null {
  if (!isMacOS()) return null;

  const homebrewPaths = [
    '/opt/homebrew/bin',  // Apple Silicon
    '/usr/local/bin'      // Intel
  ];

  for (const brewPath of homebrewPaths) {
    if (existsSync(brewPath)) {
      return brewPath;
    }
  }

  return homebrewPaths[0]; // Default to Apple Silicon path
}

/**
 * Get shell configuration for the current platform
 */
export function getShellConfig(preferredShell?: ShellType): ShellConfig {
  if (isWindows()) {
    return getWindowsShellConfig(preferredShell);
  }

  return getUnixShellConfig(preferredShell);
}

/**
 * Get Windows shell configuration
 */
function getWindowsShellConfig(preferredShell?: ShellType): ShellConfig {
  const homeDir = os.homedir();

  // Shell path candidates in order of preference
  // Note: path.join('C:', 'foo') produces 'C:foo' (relative to C: drive), not 'C:\foo'
  // We must use 'C:\\' or raw paths like 'C:\\Program Files' to get absolute paths
  const shellPaths: Record<ShellType, string[]> = {
    [ShellType.PowerShell]: [
      path.join('C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'pwsh.exe'),
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    ],
    [ShellType.CMD]: [
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    ],
    [ShellType.Bash]: [
      path.join('C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      path.join('C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      path.join('C:\\msys64', 'usr', 'bin', 'bash.exe'),
      path.join('C:\\cygwin64', 'bin', 'bash.exe')
    ],
    [ShellType.Zsh]: [],
    [ShellType.Fish]: [],
    [ShellType.Unknown]: []
  };

  const shellType = preferredShell || ShellType.PowerShell;
  const candidates = shellPaths[shellType] || shellPaths[ShellType.PowerShell];

  for (const shellPath of candidates) {
    if (existsSync(shellPath)) {
      return {
        executable: shellPath,
        args: shellType === ShellType.Bash ? ['--login'] : [],
        env: {}
      };
    }
  }

  // Fallback to default CMD
  return {
    executable: process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
    args: [],
    env: {}
  };
}

/**
 * Get Unix shell configuration
 */
function getUnixShellConfig(_preferredShell?: ShellType): ShellConfig {
  const shellPath = process.env.SHELL || '/bin/zsh';

  return {
    executable: shellPath,
    args: ['-l'],
    env: {}
  };
}

/**
 * Check if a command requires shell execution on Windows
 *
 * Windows needs shell execution for .cmd and .bat files
 */
export function requiresShell(command: string): boolean {
  if (!isWindows()) return false;

  const ext = path.extname(command).toLowerCase();
  return ['.cmd', '.bat', '.ps1'].includes(ext);
}

/**
 * Get the npm command name for the current platform
 */
export function getNpmCommand(): string {
  return isWindows() ? 'npm.cmd' : 'npm';
}

/**
 * Get the npx command name for the current platform
 */
export function getNpxCommand(): string {
  return isWindows() ? 'npx.cmd' : 'npx';
}

/**
 * Check if a path is secure (prevents command injection attacks)
 *
 * Rejects paths with shell metacharacters, directory traversal patterns,
 * or environment variable expansion.
 */
export function isSecurePath(candidatePath: string): boolean {
  // Reject empty or whitespace-only strings to maintain cross-platform consistency with backend
  if (!candidatePath || !candidatePath.trim()) return false;

  // Security validation: reject paths with dangerous patterns
  const dangerousPatterns = [
    /[;&|`${}[\]<>!"^]/,        // Shell metacharacters
    /%[^%]+%/,                   // Windows environment variable expansion
    /\.\.\//,                    // Unix directory traversal
    /\.\.\\/,                    // Windows directory traversal
    /[\r\n\x00]/                 // Newlines (command injection), null bytes (path truncation)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(candidatePath)) {
      return false;
    }
  }

  // On Windows, validate executable names additionally
  if (isWindows()) {
    const basename = path.basename(candidatePath, getExecutableExtension());
    // Allow only alphanumeric, dots, hyphens, and underscores in the name
    return /^[\w.-]+$/.test(basename);
  }

  return true;
}

/**
 * Normalize a path for the current platform
 */
export function normalizePath(inputPath: string): string {
  return path.normalize(inputPath);
}

/**
 * Join path parts using the platform separator
 */
export function joinPaths(...parts: string[]): string {
  return path.join(...parts);
}

/**
 * Get a platform-specific environment variable value
 */
export function getEnvVar(name: string): string | undefined {
  // Windows case-insensitive environment variables
  if (isWindows()) {
    for (const key of Object.keys(process.env)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return process.env[key];
      }
    }
    return undefined;
  }

  return process.env[name];
}

/**
 * Find an executable in standard locations
 *
 * Searches for an executable by name in:
 * 1. System PATH
 * 2. Platform-specific binary directories
 * 3. Common installation paths
 */
export function findExecutable(
  name: string,
  additionalPaths: string[] = []
): string | null {
  const config = getPathConfig();
  const searchPaths: string[] = [];

  // Add PATH environment
  const pathEnv = getEnvVar('PATH') || '';
  searchPaths.push(...pathEnv.split(config.delimiter).filter(Boolean));

  // Add platform-specific directories
  const bins = getBinaryDirectories();
  searchPaths.push(...bins.user, ...bins.system);

  // Add custom paths
  searchPaths.push(...additionalPaths);

  // Search with all applicable extensions
  const extensions = [...config.executableExtensions];

  for (const searchDir of searchPaths) {
    for (const ext of extensions) {
      const fullPath = path.join(searchDir, `${name}${ext}`);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Create a platform-aware description for error messages
 */
export function getPlatformDescription(): string {
  const currentOS = getCurrentOS();
  const osName = {
    [OS.Windows]: 'Windows',
    [OS.macOS]: 'macOS',
    [OS.Linux]: 'Linux'
  }[currentOS] || process.platform;

  const arch = os.arch();
  return `${osName} (${arch})`;
}

/**
 * Grace period (ms) before force-killing a process after graceful termination.
 * Used for SIGTERM->SIGKILL (Unix) and kill()->taskkill (Windows) patterns.
 */
export const GRACEFUL_KILL_TIMEOUT_MS = 5000;

export interface KillProcessOptions {
  /** Custom timeout in ms (defaults to GRACEFUL_KILL_TIMEOUT_MS) */
  timeoutMs?: number;
  /** Debug logging prefix */
  debugPrefix?: string;
  /** Whether debug logging is enabled */
  debug?: boolean;
}

export interface TerminateProcessTreeOptions {
  platform?: NodeJS.Platform;
  gracefulTimeoutMs?: number;
  forceTimeoutMs?: number;
  processGroup?: boolean;
  taskkillPath?: string;
  signalProcessGroup?: (pid: number, signal: NodeJS.Signals) => void;
  isProcessGroupAlive?: (pid: number) => boolean;
}

export class ProcessTreeTerminationError extends Error {
  constructor(message = 'Process tree termination could not be verified') {
    super(message);
    this.name = 'ProcessTreeTerminationError';
  }
}

function hasTerminalState(childProcess: ChildProcess): boolean {
  return childProcess.exitCode !== undefined && childProcess.exitCode !== null ||
    childProcess.signalCode !== undefined && childProcess.signalCode !== null;
}

function waitForExit(childProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasTerminalState(childProcess)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      childProcess.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(hasTerminalState(childProcess)), timeoutMs);
    childProcess.once('exit', onExit);
  });
}

function waitForCommand(childProcess: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      childProcess.removeListener('exit', onExit);
      childProcess.removeListener('error', onError);
    };
    const onExit = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(code);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProcessTreeTerminationError());
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        childProcess.kill();
      } catch {
        // The verification failure below remains authoritative.
      }
      reject(new ProcessTreeTerminationError());
    }, timeoutMs);
    childProcess.once('exit', onExit);
    childProcess.once('error', onError);
  });
}

function defaultSignalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  process.kill(-pid, signal);
}

function defaultIsProcessGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForUnixTreeExit(
  leaderHasExited: () => boolean,
  pid: number,
  processGroup: boolean,
  isProcessGroupAlive: (pid: number) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    const leaderExited = leaderHasExited();
    const groupExited = !processGroup || !isProcessGroupAlive(pid);
    if (leaderExited && groupExited) return true;
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, timeoutMs)));
  } while (Date.now() <= deadline);
  return false;
}

/**
 * Awaitable, platform-aware process-tree termination.
 *
 * Windows waits for `taskkill /f /t` and the tracked wrapper to exit. Unix sends
 * TERM then KILL to the detached process group and verifies both leader and
 * group termination before resolving.
 */
export async function terminateProcessTree(
  childProcess: ChildProcess,
  options: TerminateProcessTreeOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? GRACEFUL_KILL_TIMEOUT_MS;
  const forceTimeoutMs = options.forceTimeoutMs ?? GRACEFUL_KILL_TIMEOUT_MS;
  const pid = childProcess.pid;
  if (!pid) throw new ProcessTreeTerminationError('Process tree PID is unavailable');

  if (platform === 'win32') {
    const taskkill = spawn(
      options.taskkillPath ?? getTrustedTaskkillExePath(),
      ['/pid', pid.toString(), '/f', '/t'],
      { stdio: 'ignore', windowsHide: true },
    );
    const taskkillExitCode = await waitForCommand(taskkill, forceTimeoutMs);
    if (taskkillExitCode !== 0 || !await waitForExit(childProcess, forceTimeoutMs)) {
      throw new ProcessTreeTerminationError();
    }
    return;
  }

  const processGroup = options.processGroup ?? false;
  const signalProcessGroup = options.signalProcessGroup ?? defaultSignalProcessGroup;
  const isProcessGroupAlive = options.isProcessGroupAlive ?? defaultIsProcessGroupAlive;
  const signalTree = (signal: NodeJS.Signals) => {
    if (processGroup) signalProcessGroup(pid, signal);
    else childProcess.kill(signal);
  };

  let observedExit = hasTerminalState(childProcess);
  const onExit = () => {
    observedExit = true;
  };
  childProcess.once('exit', onExit);

  try {
    try {
      signalTree('SIGTERM');
    } catch {
      // Continue to verified force termination.
    }
    if (await waitForUnixTreeExit(
      () => observedExit || hasTerminalState(childProcess),
      pid,
      processGroup,
      isProcessGroupAlive,
      gracefulTimeoutMs,
    )) return;

    try {
      signalTree('SIGKILL');
    } catch {
      // Verification below determines success or failure.
    }
    if (await waitForUnixTreeExit(
      () => observedExit || hasTerminalState(childProcess),
      pid,
      processGroup,
      isProcessGroupAlive,
      forceTimeoutMs,
    )) return;
    throw new ProcessTreeTerminationError();
  } finally {
    childProcess.removeListener('exit', onExit);
  }
}

/**
 * Platform-aware process termination with graceful shutdown and forced fallback.
 *
 * Windows: .kill() then taskkill /f /t as fallback
 * Unix: SIGTERM then SIGKILL as fallback
 *
 * IMPORTANT: Taskkill/SIGKILL runs OUTSIDE the .kill() try-catch to ensure
 * fallback executes even if graceful kill throws.
 */
export function killProcessGracefully(
  childProcess: ChildProcess,
  options: KillProcessOptions = {}
): void {
  const {
    timeoutMs = GRACEFUL_KILL_TIMEOUT_MS,
    debugPrefix = '[ProcessKill]',
    debug = false
  } = options;

  const pid = childProcess.pid;
  const log = (...args: unknown[]) => {
    if (debug) console.warn(debugPrefix, ...args);
  };

  // Track if process exits before force-kill timeout
  let hasExited = false;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const cleanup = () => {
    hasExited = true;
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
  };

  if (typeof childProcess.once === 'function') {
    childProcess.once('exit', cleanup);
    childProcess.once('error', cleanup);  // Also cleanup on error
  } else {
    log('process.once unavailable, cannot track exit state');
  }

  // Attempt graceful termination (may throw if process dead)
  try {
    if (isWindows()) {
      childProcess.kill();  // Windows: no signal argument
    } else {
      childProcess.kill('SIGTERM');
    }
    log('Graceful kill signal sent');
  } catch (err) {
    log('Graceful kill failed (process likely dead):',
      err instanceof Error ? err.message : String(err));
  }

  // ALWAYS schedule force-kill fallback OUTSIDE the try-catch
  // This ensures fallback runs even if .kill() threw
  if (pid) {
    forceKillTimer = setTimeout(() => {
      if (hasExited) {
        log('Process already exited, skipping force kill');
        return;
      }

      try {
        if (isWindows()) {
          log('Running taskkill for PID:', pid);
          spawn(getTaskkillExePath(), ['/pid', pid.toString(), '/f', '/t'], {
            stdio: 'ignore',
            detached: true
          }).unref();
        } else if (!childProcess.killed) {
          log('Sending SIGKILL to PID:', pid);
          childProcess.kill('SIGKILL');
        }
      } catch (err) {
        log('Force kill failed:',
          err instanceof Error ? err.message : String(err));
      }
    }, timeoutMs);

    // Unref timer so it doesn't prevent Node.js from exiting
    forceKillTimer.unref();
  }
}
