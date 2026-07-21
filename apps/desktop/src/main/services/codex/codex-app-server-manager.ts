import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import { detectCodexCli, type CodexCliDetectionResult } from '../../cli-tool-manager';
import { getAugmentedEnv } from '../../env-utils';
import { killProcessGracefully } from '../../platform';
import {
  CodexAppServerClient,
  CodexAppServerProtocolError,
  type CodexJsonlProcess,
} from './codex-app-server-client';
import {
  parseAccountReadResponse,
  parseLoginStartResponse,
  parseModelListResponse,
  type CodexAccountReadResponse,
  type CodexLoginStartResponse,
  type CodexModel,
} from './codex-app-server-protocol';

export interface CodexAppServerSpawnOptions {
  env: Record<string, string>;
  stdio: ['pipe', 'pipe', 'pipe'];
  windowsHide: true;
}

export interface CodexAppServerManagerDependencies {
  codexHomeRoot: string;
  detectCli?: () => CodexCliDetectionResult;
  ensureDirectory?: (directory: string) => Promise<void>;
  canonicalizeDirectory?: (directory: string) => Promise<string>;
  spawn?: (
    executable: string,
    args: string[],
    options: CodexAppServerSpawnOptions,
  ) => CodexJsonlProcess;
  terminate?: (process: CodexJsonlProcess) => void;
  baseEnv?: NodeJS.ProcessEnv;
  onCatalogModels?: (accountId: string, models: ModelDescriptor[]) => void | Promise<void>;
  onDiagnostic?: (message: string) => void;
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
}

function accountDirectory(root: string, accountId: string): string {
  const digest = createHash('sha256').update(accountId).digest('hex').slice(0, 24);
  return path.join(root, digest);
}

function assertAccountId(accountId: string): void {
  if (!accountId.trim()) throw new Error('Codex account ID is required');
}

function cleanEnvironment(baseEnv: NodeJS.ProcessEnv, codexHome: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) env[key] = value;
  }
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  delete env.CODEX_HOME;
  env.CODEX_HOME = codexHome;
  return env;
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

export function createCodexAppServerManager(
  dependencies: CodexAppServerManagerDependencies,
): CodexAppServerManager {
  const detectCli = dependencies.detectCli ?? detectCodexCli;
  const ensureDirectory = dependencies.ensureDirectory ?? (async (directory: string) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  });
  const canonicalizeDirectory = dependencies.canonicalizeDirectory ?? (async (directory) => {
    try {
      return await realpath(directory);
    } catch {
      return path.resolve(directory);
    }
  });
  const spawn = dependencies.spawn ?? ((executable, args, options) => (
    nodeSpawn(executable, args, options) as unknown as CodexJsonlProcess
  ));
  const terminate = dependencies.terminate ?? ((process) => {
    killProcessGracefully(process as unknown as ChildProcess, {
      debugPrefix: '[CodexAppServer]',
    });
  });
  const sessions = new Map<string, PendingSession>();
  const terminated = new WeakSet<object>();

  function terminateOnce(process: CodexJsonlProcess): void {
    if (terminated.has(process)) return;
    terminated.add(process);
    terminate(process);
  }

  async function createSession(accountId: string, token: symbol): Promise<AccountSession> {
    const detection = detectCli();
    if (!detection.found || !detection.path) {
      throw new Error(detection.message ?? "Codex CLI isn't available");
    }

    const requestedCodexHome = accountDirectory(dependencies.codexHomeRoot, accountId);
    await ensureDirectory(requestedCodexHome);
    const codexHome = await canonicalizeDirectory(requestedCodexHome);
    const process = spawn(detection.path, ['app-server', '--stdio'], {
      env: cleanEnvironment(dependencies.baseEnv ?? getAugmentedEnv(), codexHome),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let client: CodexAppServerClient;
    client = new CodexAppServerClient(process, {
      expectedCodexHome: codexHome,
      onDiagnostic: dependencies.onDiagnostic,
      onFatal: (_error, processEnded) => {
        if (sessions.get(accountId)?.token === token) sessions.delete(accountId);
        if (!processEnded) terminateOnce(process);
      },
    });

    try {
      await client.initialize();
      if (detection.runtimeValidationRequired) {
        dependencies.onDiagnostic?.(
          `Codex CLI ${detection.version ?? 'newer'} passed runtime protocol validation`,
        );
      }
      return { client, process };
    } catch (error) {
      terminateOnce(process);
      throw error;
    }
  }

  function getSession(accountId: string): Promise<AccountSession> {
    assertAccountId(accountId);
    let entry = sessions.get(accountId);
    if (!entry) {
      const token = Symbol(accountId);
      const promise = createSession(accountId, token).catch((error) => {
        if (sessions.get(accountId)?.token === token) sessions.delete(accountId);
        throw error;
      });
      entry = { token, promise };
      sessions.set(accountId, entry);
    }
    return entry.promise;
  }

  async function request(accountId: string, method: string, params: unknown): Promise<unknown> {
    const session = await getSession(accountId);
    return session.client.request(method, params);
  }

  async function readAccount(accountId: string): Promise<CodexAccountReadResponse> {
    const parsed = parseAccountReadResponse(await request(
      accountId,
      'account/read',
      { refreshToken: false },
    ));
    if (!parsed) {
      throw new CodexAppServerProtocolError('Invalid account/read response from Codex app-server');
    }
    return parsed;
  }

  return {
    readAccount,
    async startLogin(accountId) {
      const parsed = parseLoginStartResponse(await request(accountId, 'account/login/start', {
        type: 'chatgpt',
        appBrand: 'codex',
        codexStreamlinedLogin: true,
      }));
      if (!parsed) {
        throw new CodexAppServerProtocolError(
          'Invalid account/login/start response from Codex app-server',
        );
      }
      return parsed;
    },
    async listModels(accountId) {
      const account = await readAccount(accountId);
      if (account.account?.type !== 'chatgpt') {
        throw new Error('Codex subscription account is not authenticated');
      }
      const models: ModelDescriptor[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const parsed = parseModelListResponse(await request(accountId, 'model/list', {
          cursor,
          includeHidden: false,
        }));
        if (!parsed) {
          throw new CodexAppServerProtocolError('Invalid model/list response from Codex app-server');
        }
        models.push(...parsed.data.filter((model) => !model.hidden).map(toDescriptor));
        cursor = parsed.nextCursor ?? null;
        if (cursor && seenCursors.has(cursor)) {
          throw new CodexAppServerProtocolError(
            'Codex app-server returned a repeated model/list cursor',
          );
        }
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      await dependencies.onCatalogModels?.(accountId, models);
      return models;
    },
    async shutdown() {
      const active = await Promise.allSettled(
        [...sessions.values()].map((session) => session.promise),
      );
      sessions.clear();
      for (const result of active) {
        if (result.status === 'fulfilled') terminateOnce(result.value.process);
      }
    },
  };
}
