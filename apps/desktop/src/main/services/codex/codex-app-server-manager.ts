import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import { detectCodexCliAsync, type CodexCliDetectionResult } from '../../cli-tool-manager';
import { getAugmentedEnvAsync } from '../../env-utils';
import { CodexAppServerClient, type CodexJsonlProcess } from './codex-app-server-client';
import { createCodexEnvironment } from './codex-environment';
import { CodexRuntimeError } from './codex-errors';
import {
  parseAccountReadResponse,
  parseCommandExecResponse,
  parseLoginStartResponse,
  parseModelListResponse,
  parseThreadResumeResponse,
  parseThreadStartResponse,
  parseTurnStartResponse,
  type CodexAccountReadResponse,
  type CodexLoginStartResponse,
  type CodexCommandExecParams,
  type CodexCommandExecResponse,
  type CodexModel,
} from './codex-app-server-protocol';
import type {
  CodexAccountLifecycleEvent,
  CodexExecutionManager,
  CodexExecutionThreadOptions,
  CodexExecutionTurnOptions,
} from './codex-execution-backend';

const MAX_MODEL_PAGES = 20;
const MAX_CATALOG_MODELS = 1_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

export interface CodexAppServerSpawnOptions {
  env: Record<string, string>;
  shell: false;
  stdio: ['pipe', 'pipe', 'pipe'];
  windowsHide: true;
  detached: boolean;
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
  getBaseEnvironment?: () => Promise<NodeJS.ProcessEnv>;
  platform?: NodeJS.Platform;
  shutdownTimeoutMs?: number;
  clientVersion?: string;
  onCatalogModels?: (accountId: string, models: ModelDescriptor[]) => void | Promise<void>;
  onDiagnostic?: (message: string) => void;
  onNotification?: (accountId: string, method: string, params: unknown) => void | Promise<void>;
}

export interface CodexAppServerManager extends CodexExecutionManager {
  readAccount(accountId: string): Promise<CodexAccountReadResponse>;
  startLogin(accountId: string): Promise<CodexLoginStartResponse>;
  listModels(accountId: string): Promise<ModelDescriptor[]>;
  getSandboxRuntimeVersion(accountId: string): Promise<string>;
  executeSandboxCommand(
    accountId: string,
    request: CodexCommandExecParams,
  ): Promise<CodexCommandExecResponse>;
  shutdown(): Promise<void>;
}

interface AccountSession {
  client: CodexAppServerClient;
  process: CodexJsonlProcess;
  runtimeVersion: string;
}

interface PendingSession {
  token: symbol;
  promise: Promise<AccountSession>;
  process?: CodexJsonlProcess;
  client?: CodexAppServerClient;
  processEnded?: boolean;
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

async function shutdownCodexProcess(
  child: CodexJsonlProcess,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== undefined && child.exitCode !== null ||
    child.signalCode !== undefined && child.signalCode !== null) {
    throw new CodexRuntimeError('termination-failed');
  }
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      let settled = false;
      let stdinFailure: Error | undefined;
      let stdinSettled = false;
      let childFailure = false;
      let childOutcome: { code: number | null; signal: NodeJS.Signals | null } | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
        child.stdin.removeListener('error', onStdinError);
        child.stdin.removeListener('close', onStdinClose);
        child.stdin.removeListener('finish', onStdinFinish);
      };
      const rejectTermination = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new CodexRuntimeError('termination-failed'));
      };
      const settleIfComplete = () => {
        if (settled) return;
        if (stdinSettled && (stdinFailure || childFailure)) {
          rejectTermination();
          return;
        }
        if (!stdinSettled || !childOutcome) return;
        settled = true;
        cleanup();
        resolve(childOutcome);
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        childOutcome = { code, signal };
        settleIfComplete();
      };
      const onError = () => {
        childFailure = true;
        settleIfComplete();
      };
      const onStdinError = (error: Error) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') return;
        stdinFailure = error;
      };
      const onStdinClose = () => {
        stdinSettled = true;
        settleIfComplete();
      };
      const onStdinFinish = () => {
        stdinSettled = true;
        settleIfComplete();
      };
      const timer = setTimeout(rejectTermination, timeoutMs);
      timer.unref?.();
      child.once('exit', onExit);
      child.once('error', onError);
      child.stdin.on('error', onStdinError);
      child.stdin.on('close', onStdinClose);
      child.stdin.on('finish', onStdinFinish);
      stdinSettled = child.stdin.writableFinished || child.stdin.destroyed;
      if (stdinSettled || child.stdin.writableEnded) {
        settleIfComplete();
        return;
      }
      try {
        child.stdin.end();
      } catch (error) {
        onStdinError(error instanceof Error ? error : new Error(String(error)));
        stdinSettled = true;
        settleIfComplete();
      }
    },
  );
  if (outcome.code !== 0 || outcome.signal !== null) {
    throw new CodexRuntimeError('termination-failed');
  }
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
  const terminate = dependencies.terminate ?? ((process) => shutdownCodexProcess(
    process,
    dependencies.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS,
  ));
  const sessions = new Map<string, PendingSession>();
  const accountTerminations = new Map<string, Promise<void>>();
  const canonicalOwners = new Map<string, string>();
  const terminations = new WeakMap<object, Promise<void>>();
  const expectedTerminations = new WeakSet<object>();
  const notificationListeners = new Map<
    string,
    Set<(method: string, params: unknown) => void>
  >();
  const lifecycleListeners = new Map<
    string,
    Set<(event: CodexAccountLifecycleEvent) => void>
  >();
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
    expectedTerminations.add(process);
    const operation = Promise.resolve()
      .then(() => terminate(process))
      .then(() => undefined)
      .catch(() => {
        throw new CodexRuntimeError('termination-failed');
      });
    terminations.set(process, operation);
    return operation;
  }

  function quarantineAccount(accountId: string): void {
    const barrier = Promise.reject<void>(new CodexRuntimeError('termination-failed'));
    void barrier.catch(() => undefined);
    accountTerminations.set(accountId, barrier);
    dependencies.onDiagnostic?.('Codex app-server ownership could not be verified');
  }

  function emitLifecycle(accountId: string, event: CodexAccountLifecycleEvent): void {
    for (const listener of [...(lifecycleListeners.get(accountId) ?? [])]) {
      try {
        listener(event);
      } catch {
        dependencies.onDiagnostic?.('Codex account lifecycle handler failed');
      }
    }
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

  async function createSession(accountId: string, entry: PendingSession): Promise<AccountSession> {
    try {
      assertOpen();
      if (platform === 'win32') throw new CodexRuntimeError('platform-unsupported');
      await accountTerminations.get(accountId);
      assertOpen();
      const baseEnvironment = dependencies.baseEnv ??
        await (dependencies.getBaseEnvironment ?? getAugmentedEnvAsync)();
      assertOpen();
      const detection = await detectCli();
      assertOpen();
      const runtimeExecutable = detection.runtimePath ?? (
        dependencies.detectCli ? detection.path : undefined
      );
      if (!detection.found || !runtimeExecutable) {
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

      const child = spawn(runtimeExecutable, ['app-server', '--stdio'], {
        env: createCodexEnvironment(
          baseEnvironment,
          codexHome,
          platform,
        ),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: false,
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
          emitLifecycle(accountId, { type: 'process-death', retryable: true });
          if (processEnded) entry.processEnded = true;
          if (sessions.get(accountId)?.token === entry.token) sessions.delete(accountId);
          if (!processEnded) trackAccountTermination(accountId, child);
          else if (!expectedTerminations.has(child)) quarantineAccount(accountId);
        },
        onNotification: (method, params) => {
          for (const listener of notificationListeners.get(accountId) ?? []) {
            try {
              listener(method, params);
            } catch {
              dependencies.onDiagnostic?.('Codex execution notification handler failed');
            }
          }
          void Promise.resolve(dependencies.onNotification?.(accountId, method, params)).catch(() => {
            dependencies.onDiagnostic?.('Codex app-server notification handler failed');
          });
        },
      });
      entry.client = client;
      await client.initialize();
      if (detection.runtimeValidationRequired) {
        dependencies.onDiagnostic?.(
          `Codex CLI ${detection.version ?? 'newer'} passed runtime protocol validation`,
        );
      }
      return { client, process: child, runtimeVersion: detection.version ?? 'unknown' };
    } catch (error) {
      if (entry.process && !entry.processEnded) await terminateOnce(entry.process);
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
      { refreshToken: true },
    ));
    if (!parsed) throw new CodexRuntimeError('protocol-error');
    return parsed;
  }

  async function authenticatedSession(accountId: string): Promise<AccountSession> {
    const account = await readAccount(accountId);
    if (account.account?.type !== 'chatgpt') {
      throw new CodexRuntimeError('authentication-required');
    }
    return getSession(accountId);
  }

  function threadParams(options: CodexExecutionThreadOptions) {
    return {
      cwd: options.cwd,
      runtimeWorkspaceRoots: options.runtimeWorkspaceRoots,
      model: options.model,
      developerInstructions: options.developerInstructions,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
      config: { sandbox_workspace_write: { network_access: options.networkAccess } },
    } as const;
  }

  return {
    readAccount,
    async getSandboxRuntimeVersion(accountId) {
      return (await getSession(accountId)).runtimeVersion;
    },
    async executeSandboxCommand(accountId, request) {
      const session = await getSession(accountId);
      const parsed = parseCommandExecResponse(await session.client.request('command/exec', request));
      if (!parsed) throw new CodexRuntimeError('protocol-error');
      return parsed;
    },
    async getRuntimeVersion(accountId) {
      return (await authenticatedSession(accountId)).runtimeVersion;
    },
    subscribe(accountId, listener) {
      let listeners = notificationListeners.get(accountId);
      if (!listeners) {
        listeners = new Set();
        notificationListeners.set(accountId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) notificationListeners.delete(accountId);
      };
    },
    subscribeLifecycle(accountId, listener) {
      let listeners = lifecycleListeners.get(accountId);
      if (!listeners) {
        listeners = new Set();
        lifecycleListeners.set(accountId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) lifecycleListeners.delete(accountId);
      };
    },
    async startThread(accountId, options) {
      const session = await authenticatedSession(accountId);
      const parsed = parseThreadStartResponse(await session.client.request(
        'thread/start',
        threadParams(options),
      ));
      if (!parsed) throw new CodexRuntimeError('protocol-error');
      return { threadId: parsed.thread.id, runtimeVersion: session.runtimeVersion };
    },
    async resumeThread(accountId, options) {
      const session = await authenticatedSession(accountId);
      const parsed = parseThreadResumeResponse(await session.client.request(
        'thread/resume',
        { ...threadParams(options), threadId: options.threadId },
      ));
      if (!parsed) throw new CodexRuntimeError('protocol-error');
      return { threadId: parsed.thread.id, runtimeVersion: session.runtimeVersion };
    },
    async startTurn(accountId, options: CodexExecutionTurnOptions) {
      const session = await authenticatedSession(accountId);
      const parsed = parseTurnStartResponse(await session.client.request('turn/start', {
        threadId: options.threadId,
        input: [{ type: 'text', text: options.input, text_elements: [] }],
        cwd: options.cwd,
        model: options.model,
        runtimeWorkspaceRoots: options.runtimeWorkspaceRoots,
        ...(options.reasoningEffort ? { effort: options.reasoningEffort } : {}),
        ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
        approvalPolicy: options.approvalPolicy,
        sandboxPolicy: options.sandboxPolicy,
      }));
      if (!parsed) throw new CodexRuntimeError('protocol-error');
      return { turnId: parsed.turn.id };
    },
    async interruptTurn(accountId, threadId, turnId) {
      const session = await getSession(accountId);
      await session.client.request('turn/interrupt', { threadId, turnId });
    },
    async retireAccount(accountId) {
      const entry = sessions.get(accountId);
      if (!entry) {
        const termination = accountTerminations.get(accountId);
        if (termination) await termination;
        return;
      }
      const session = await entry.promise;
      emitLifecycle(accountId, { type: 'retiring' });
      if (sessions.get(accountId)?.token === entry.token) sessions.delete(accountId);
      session.client.close();
      try {
        await trackAccountTermination(accountId, session.process);
        emitLifecycle(accountId, { type: 'retired' });
      } catch (error) {
        emitLifecycle(accountId, { type: 'termination-failed', retryable: true });
        throw error;
      }
    },
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
      const session = await authenticatedSession(accountId);
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
    async verifyExecutionModel(accountId, modelId, reasoningEffort) {
      const models = await this.listModels(accountId);
      const selected = models.find((model) => (
        model.id === modelId && model.availability === 'available'
      ));
      if (!selected || (reasoningEffort &&
        !selected.thinking.effortLevels.includes(reasoningEffort))) {
        throw new CodexRuntimeError('discovery-failed');
      }
    },
    async shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      const active = [...sessions.entries()];
      for (const [accountId] of active) {
        emitLifecycle(accountId, { type: 'retiring' });
      }
      for (const [, entry] of active) entry.client?.close();
      sessions.clear();
      const operationsByAccount = new Map(accountTerminations);
      for (const [accountId, entry] of active) {
        if (entry.process) {
          operationsByAccount.set(accountId, trackAccountTermination(accountId, entry.process));
        }
      }
      const operations = [...operationsByAccount].map(([accountId, operation]) => ({
        accountId,
        operation,
      }));
      shutdownPromise = Promise.allSettled(operations.map(({ operation }) => operation))
        .then((results) => {
          results.forEach((result, index) => {
            const accountId = operations[index]?.accountId;
            if (!accountId) return;
            emitLifecycle(accountId, result.status === 'fulfilled'
              ? { type: 'retired' }
              : { type: 'termination-failed', retryable: true });
          });
          if (results.some((result) => result.status === 'rejected')) {
            throw new CodexRuntimeError('termination-failed');
          }
        });
      return shutdownPromise;
    },
  };
}
