import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import { detectCodexCliAsync, type CodexCliDetectionResult } from '../../cli-tool-manager';
import { getAugmentedEnv } from '../../env-utils';
import { isSecurePath as isSecureWindowsPath } from '../../utils/windows-paths';
import { CodexAppServerClient, type CodexJsonlProcess } from './codex-app-server-client';
import { createCodexEnvironment, trustedWindowsCommandProcessor } from './codex-environment';
import { CodexRuntimeError } from './codex-errors';
import {
  parseAccountReadResponse,
  parseLoginStartResponse,
  parseModelListResponse,
  type CodexAccountReadResponse,
  type CodexLoginStartResponse,
  type CodexModel,
} from './codex-app-server-protocol';

const MAX_MODEL_PAGES = 20;
const MAX_CATALOG_MODELS = 1_000;
const TERMINATION_TIMEOUT_MS = 5_000;

export interface CodexAppServerSpawnOptions {
  env: Record<string, string>;
  shell: false;
  stdio: ['pipe', 'pipe', 'pipe'];
  windowsHide: true;
  windowsVerbatimArguments?: boolean;
}

export interface CodexAppServerManagerDependencies {
  codexHomeRoot: string;
  detectCli?: () => CodexCliDetectionResult | Promise<CodexCliDetectionResult>;
  ensureDirectory?: (directory: string) => Promise<void>;
  canonicalizeDirectory?: (directory: string) => Promise<string>;
  spawn?: (
    executable: string,
    args: string[],
    options: CodexAppServerSpawnOptions,
  ) => CodexJsonlProcess;
  terminate?: (process: CodexJsonlProcess) => void | Promise<void>;
  baseEnv?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  comSpec?: string;
  isSecurePath?: (executable: string) => boolean;
  clientVersion?: string;
  onCatalogModels?: (accountId: string, models: ModelDescriptor[]) => void | Promise<void>;
  onDiagnostic?: (message: string) => void;
  onNotification?: (accountId: string, method: string, params: unknown) => void | Promise<void>;
}

export interface CodexAppServerManager {
  readAccount(accountId: string): Promise<CodexAccountReadResponse>;
  startLogin(accountId: string): Promise<CodexLoginStartResponse>;
  listModels(accountId: string): Promise<ModelDescriptor[]>;
  shutdown(): Promise<void>;
}

interface AccountSession {
  client: CodexAppServerClient;
  process: CodexJsonlProcess;
}

interface PendingSession {
  token: symbol;
  promise: Promise<AccountSession>;
  process?: CodexJsonlProcess;
}

function toDescriptor(model: CodexModel): ModelDescriptor {
  return {
    id: model.model,
    label: model.displayName,
    provider: 'openai',
    authModes: ['oauth'],
    backend: 'codex-app-server',
    thinking: {
      mode: model.supportedReasoningEfforts.length > 0 ? 'manual' : 'none',
      effortLevels: model.supportedReasoningEfforts.map((effort) => effort.reasoningEffort),
    },
    source: 'provider',
    availability: 'available',
  };
}

function isContained(pathApi: typeof path.posix, root: string, candidate: string): boolean {
  const relative = pathApi.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${pathApi.sep}`) && relative !== '..' &&
    !pathApi.isAbsolute(relative);
}

export interface CodexTerminationOptions {
  gracefulTimeoutMs?: number;
  forceTimeoutMs?: number;
}

function hasExited(process: CodexJsonlProcess): boolean {
  return process.exitCode !== undefined && process.exitCode !== null ||
    process.signalCode !== undefined && process.signalCode !== null;
}

function signalAndWaitForExit(
  process: CodexJsonlProcess,
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> {
  if (hasExited(process)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(hasExited(process)), timeoutMs);
    timer.unref?.();
    process.once('exit', onExit);
    try {
      process.kill(signal);
    } catch {
      finish(hasExited(process));
    }
  });
}

export async function terminateCodexProcess(
  process: CodexJsonlProcess,
  options: CodexTerminationOptions = {},
): Promise<void> {
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? TERMINATION_TIMEOUT_MS;
  const forceTimeoutMs = options.forceTimeoutMs ?? TERMINATION_TIMEOUT_MS;
  if (await signalAndWaitForExit(process, 'SIGTERM', gracefulTimeoutMs)) return;
  if (await signalAndWaitForExit(process, 'SIGKILL', forceTimeoutMs)) return;
  throw new CodexRuntimeError('termination-failed');
}

export function createCodexAppServerManager(
  dependencies: CodexAppServerManagerDependencies,
): CodexAppServerManager {
  const platform = dependencies.platform ?? process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const detectCli = dependencies.detectCli ?? detectCodexCliAsync;
  const ensureDirectory = dependencies.ensureDirectory ?? (async (directory: string) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  });
  const canonicalizeDirectory = dependencies.canonicalizeDirectory ?? realpath;
  const spawn = dependencies.spawn ?? ((executable, args, options) => (
    nodeSpawn(executable, args, options) as unknown as CodexJsonlProcess
  ));
  const terminate = dependencies.terminate ?? terminateCodexProcess;
  const sessions = new Map<string, PendingSession>();
  const accountTerminations = new Map<string, Promise<void>>();
  const canonicalOwners = new Map<string, string>();
  const terminations = new WeakMap<object, Promise<void>>();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;
  let canonicalRootPromise: Promise<string> | undefined;

  function publicError(error: unknown): CodexRuntimeError {
    return error instanceof CodexRuntimeError
      ? error
      : new CodexRuntimeError('spawn-failed');
  }

  function assertOpen(): void {
    if (shuttingDown) throw new CodexRuntimeError('shutdown');
  }

  function terminateOnce(process: CodexJsonlProcess): Promise<void> {
    const existing = terminations.get(process);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => terminate(process)).then(() => undefined);
    terminations.set(process, operation);
    return operation;
  }

  function trackAccountTermination(accountId: string, process: CodexJsonlProcess): Promise<void> {
    const operation = terminateOnce(process);
    accountTerminations.set(accountId, operation);
    void operation.then(
      () => {
        if (accountTerminations.get(accountId) === operation) {
          accountTerminations.delete(accountId);
        }
      },
      () => dependencies.onDiagnostic?.('Codex app-server termination could not be verified'),
    );
    return operation;
  }

  async function canonicalRoot(): Promise<string> {
    if (!canonicalRootPromise) {
      canonicalRootPromise = (async () => {
        await ensureDirectory(dependencies.codexHomeRoot);
        try {
          return await canonicalizeDirectory(dependencies.codexHomeRoot);
        } catch {
          throw new CodexRuntimeError('isolation-failed');
        }
      })();
    }
    return canonicalRootPromise;
  }

  function spawnInvocation(executable: string): {
    executable: string;
    args: string[];
    windowsVerbatimArguments?: boolean;
  } {
    if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable)) {
      return { executable, args: ['app-server', '--stdio'] };
    }
    const securePath = dependencies.isSecurePath ?? isSecureWindowsPath;
    if (!securePath(executable) || /[%!^&|<>\r\n]/.test(executable)) {
      throw new CodexRuntimeError('spawn-failed');
    }
    const trustedComSpec = trustedWindowsCommandProcessor();
    const comSpec = dependencies.comSpec ?? trustedComSpec;
    if (path.win32.normalize(comSpec).toLowerCase() !==
      path.win32.normalize(trustedComSpec).toLowerCase()) {
      throw new CodexRuntimeError('spawn-failed');
    }
    return {
      executable: comSpec,
      args: ['/d', '/s', '/c', `""${executable}" app-server --stdio"`],
      windowsVerbatimArguments: true,
    };
  }

  async function createSession(accountId: string, entry: PendingSession): Promise<AccountSession> {
    try {
      assertOpen();
      await accountTerminations.get(accountId);
      assertOpen();
      const detection = await detectCli();
      assertOpen();
      if (!detection.found || !detection.path) {
        throw new CodexRuntimeError(detection.version ? 'cli-unsupported' : 'cli-unavailable');
      }

      const root = await canonicalRoot();
      assertOpen();
      const requestedHome = pathApi.join(root, createHash('sha256')
        .update(accountId)
        .digest('hex')
        .slice(0, 24));
      await ensureDirectory(requestedHome);
      let codexHome: string;
      try {
        codexHome = await canonicalizeDirectory(requestedHome);
      } catch {
        throw new CodexRuntimeError('isolation-failed');
      }
      assertOpen();
      if (!isContained(pathApi, root, codexHome)) {
        throw new CodexRuntimeError('isolation-failed');
      }
      const owner = canonicalOwners.get(codexHome);
      if (owner && owner !== accountId) throw new CodexRuntimeError('isolation-failed');
      canonicalOwners.set(codexHome, accountId);

      const invocation = spawnInvocation(detection.path);
      const child = spawn(invocation.executable, invocation.args, {
        env: createCodexEnvironment(
          dependencies.baseEnv ?? getAugmentedEnv(),
          codexHome,
          platform,
        ),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(invocation.windowsVerbatimArguments
          ? { windowsVerbatimArguments: invocation.windowsVerbatimArguments }
          : {}),
      });
      entry.process = child;
      if (shuttingDown) {
        await terminateOnce(child);
        throw new CodexRuntimeError('shutdown');
      }

      const client = new CodexAppServerClient(child, {
        clientVersion: dependencies.clientVersion,
        expectedCodexHome: codexHome,
        onDiagnostic: dependencies.onDiagnostic,
        onFatal: (_error, processEnded) => {
          if (sessions.get(accountId)?.token === entry.token) sessions.delete(accountId);
          if (!processEnded) trackAccountTermination(accountId, child);
        },
        onNotification: (method, params) => {
          void Promise.resolve(dependencies.onNotification?.(accountId, method, params)).catch(() => {
            dependencies.onDiagnostic?.('Codex app-server notification handler failed');
          });
        },
      });
      await client.initialize();
      if (detection.runtimeValidationRequired) {
        dependencies.onDiagnostic?.(
          `Codex CLI ${detection.version ?? 'newer'} passed runtime protocol validation`,
        );
      }
      return { client, process: child };
    } catch (error) {
      if (entry.process) await terminateOnce(entry.process);
      throw publicError(error);
    }
  }

  function getSession(accountId: string): Promise<AccountSession> {
    assertOpen();
    if (!accountId.trim()) throw new CodexRuntimeError('isolation-failed');
    let entry = sessions.get(accountId);
    if (!entry) {
      const token = Symbol(accountId);
      entry = { token, promise: undefined as unknown as Promise<AccountSession> };
      entry.promise = createSession(accountId, entry).catch((error) => {
        if (sessions.get(accountId)?.token === token) sessions.delete(accountId);
        throw error;
      });
      sessions.set(accountId, entry);
    }
    return entry.promise;
  }

  async function readAccount(accountId: string): Promise<CodexAccountReadResponse> {
    const session = await getSession(accountId);
    const parsed = parseAccountReadResponse(await session.client.request(
      'account/read',
      { refreshToken: false },
    ));
    if (!parsed) throw new CodexRuntimeError('protocol-error');
    return parsed;
  }

  return {
    readAccount,
    async startLogin(accountId) {
      const session = await getSession(accountId);
      const parsed = parseLoginStartResponse(await session.client.request(
        'account/login/start',
        { type: 'chatgpt', appBrand: 'codex', codexStreamlinedLogin: true },
      ));
      if (!parsed) throw new CodexRuntimeError('protocol-error');
      return parsed;
    },
    async listModels(accountId) {
      const account = await readAccount(accountId);
      if (account.account?.type !== 'chatgpt') {
        throw new CodexRuntimeError('authentication-required');
      }
      const session = await getSession(accountId);
      const models: ModelDescriptor[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        pages += 1;
        if (pages > MAX_MODEL_PAGES) throw new CodexRuntimeError('protocol-error');
        const parsed = parseModelListResponse(await session.client.request('model/list', {
          cursor,
          includeHidden: false,
        }));
        if (!parsed) throw new CodexRuntimeError('protocol-error');
        models.push(...parsed.data.filter((model) => !model.hidden).map(toDescriptor));
        if (models.length > MAX_CATALOG_MODELS) throw new CodexRuntimeError('protocol-error');
        cursor = parsed.nextCursor ?? null;
        if (cursor && seenCursors.has(cursor)) throw new CodexRuntimeError('protocol-error');
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      await dependencies.onCatalogModels?.(accountId, models);
      return models;
    },
    async shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      const active = [...sessions.entries()];
      sessions.clear();
      const operations = [
        ...accountTerminations.values(),
        ...active.flatMap(([accountId, entry]) => (
          entry.process ? [trackAccountTermination(accountId, entry.process)] : []
        )),
      ];
      shutdownPromise = Promise.allSettled(operations).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          throw new CodexRuntimeError('termination-failed');
        }
      });
      return shutdownPromise;
    },
  };
}
