import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import {
  createCodexAppServerManager,
  type CodexAppServerManagerDependencies,
  type CodexAppServerSpawnOptions,
} from './codex-app-server-manager';
import type { CodexJsonlProcess } from './codex-app-server-client';
import { CodexRuntimeError } from './codex-errors';

type FinalizeStdin = (process: ScriptedProcess, done: (error?: Error | null) => void) => void;

class ScriptedProcess extends EventEmitter implements CodexJsonlProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin: Writable;
  readonly methods: string[] = [];
  readonly requests: Array<{ id?: number; method: string; params?: Record<string, unknown> }> = [];
  pid = 8080;
  killed = false;

  constructor(readonly codexHome: string, finalizeStdin?: FinalizeStdin) {
    super();
    let buffered = '';
    this.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        buffered += chunk.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          const request = JSON.parse(line) as {
            id?: number;
            method: string;
            params?: Record<string, unknown>;
          };
          this.requests.push(request);
          this.methods.push(request.method);
          queueMicrotask(() => {
            if (request.method === 'initialize') {
              this.reply(request.id, {
                codexHome,
                platformFamily: 'unix',
                platformOs: 'macos',
                userAgent: 'codex_cli_rs/0.144.6',
              });
            } else if (request.method === 'account/read') {
              this.reply(request.id, {
                account: { type: 'chatgpt', email: 'user@example.com', planType: 'plus' },
                requiresOpenaiAuth: true,
              });
            } else if (request.method === 'account/login/start') {
              this.reply(request.id, {
                type: 'chatgpt',
                loginId: 'login-1',
                authUrl: 'https://auth.openai.com/example',
              });
            } else if (request.method === 'model/list') {
              this.reply(request.id, {
                data: [{
                  id: 'gpt-5.6-codex',
                  model: 'gpt-5.6-codex',
                  displayName: 'GPT-5.6 Codex',
                  description: 'Current Codex model',
                  hidden: false,
                  isDefault: true,
                  defaultReasoningEffort: 'medium',
                  supportedReasoningEfforts: [
                    { reasoningEffort: 'low', description: 'Fast' },
                    { reasoningEffort: 'medium', description: 'Balanced' },
                  ],
                }],
                nextCursor: null,
              });
            } else if (request.method === 'thread/start') {
              this.reply(request.id, { thread: { id: 'thread-new' } });
            } else if (request.method === 'thread/resume') {
              this.reply(request.id, { thread: { id: request.params?.threadId } });
            } else if (request.method === 'turn/start') {
              this.reply(request.id, { turn: { id: 'turn-1', status: 'inProgress' } });
            } else if (request.method === 'turn/interrupt') {
              this.reply(request.id, {});
            }
          });
        }
        done();
      },
      final: (done) => {
        if (finalizeStdin) finalizeStdin(this, done);
        else done();
      },
    });
  }

  private reply(id: number | undefined, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`);
  }

  notify(method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ method, params })}\n`);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe('per-account Codex app-server manager', () => {
  it('publishes authoritative account lifecycle around retirement and process death', async () => {
    let process: ScriptedProcess | undefined;
    const lifecycle = vi.fn();
    const terminate = vi.fn(async () => {
      expect(lifecycle).toHaveBeenCalledWith({ type: 'retiring' });
    });
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true, path: '/usr/local/bin/codex', version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      terminate,
    });
    manager.subscribeLifecycle('account-a', lifecycle);
    await manager.readAccount('account-a');

    process?.emit('exit', 1, null);
    expect(lifecycle).toHaveBeenCalledWith({ type: 'process-death', retryable: true });

    lifecycle.mockClear();
    await manager.readAccount('account-b');
    manager.subscribeLifecycle('account-b', lifecycle);
    await manager.retireAccount('account-b');
    expect(lifecycle.mock.calls).toEqual([
      [{ type: 'retiring' }],
      [{ type: 'retired' }],
    ]);
  });

  it('publishes termination-failed only after cooperative retirement fails', async () => {
    const lifecycle = vi.fn();
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true, path: '/usr/local/bin/codex', version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate: vi.fn().mockRejectedValue(new Error('termination failed')),
    });
    await manager.readAccount('account-a');
    manager.subscribeLifecycle('account-a', lifecycle);

    await expect(manager.retireAccount('account-a')).rejects.toMatchObject({
      code: 'termination-failed',
    });
    expect(lifecycle.mock.calls).toEqual([
      [{ type: 'retiring' }],
      [{ type: 'termination-failed', retryable: true }],
    ]);
  });

  it('makes concurrent retirement callers await the same successful termination barrier', async () => {
    let releaseTermination!: () => void;
    const termination = new Promise<void>((resolve) => { releaseTermination = resolve; });
    const terminate = vi.fn(async () => termination);
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true, path: '/usr/local/bin/codex', version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate,
    });
    await manager.readAccount('account-a');

    const first = manager.retireAccount('account-a');
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce());
    let secondSettled = false;
    const second = manager.retireAccount('account-a').then(() => { secondSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(secondSettled).toBe(false);

    releaseTermination();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('propagates the same concurrent retirement failure to every caller', async () => {
    let failTermination!: () => void;
    const termination = new Promise<void>((_resolve, reject) => {
      failTermination = () => reject(new Error('private termination failure'));
    });
    const terminate = vi.fn(async () => termination);
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true, path: '/usr/local/bin/codex', version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate,
    });
    await manager.readAccount('account-a');

    const first = manager.retireAccount('account-a');
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce());
    const second = manager.retireAccount('account-a');
    failTermination();
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe('rejected');
    expect(secondResult.status).toBe('rejected');
    if (firstResult.status === 'rejected' && secondResult.status === 'rejected') {
      expect(firstResult.reason).toBe(secondResult.reason);
      expect(firstResult.reason).toMatchObject({ code: 'termination-failed' });
    }
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('keeps typed execution RPC and notifications inside the account manager', async () => {
    let process: ScriptedProcess | undefined;
    const terminate = vi.fn();
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      terminate,
    });
    const notifications = vi.fn();
    const unsubscribe = manager.subscribe('account-a', notifications);
    const options = {
      cwd: '/worktree', model: 'gpt-5.3-codex', developerInstructions: 'Do the task',
      approvalPolicy: 'never' as const, sandbox: 'workspace-write' as const,
      networkAccess: false as const,
      runtimeWorkspaceRoots: ['/worktree'],
    };

    await expect(manager.startThread('account-a', options)).resolves.toEqual({
      threadId: 'thread-new', runtimeVersion: '0.144.6',
    });
    await expect(manager.resumeThread('account-a', { ...options, threadId: 'thread-new' }))
      .resolves.toEqual({ threadId: 'thread-new', runtimeVersion: '0.144.6' });
    await expect(manager.startTurn('account-a', {
      threadId: 'thread-new', input: 'Implement it', cwd: '/worktree',
      model: 'gpt-5.3-codex', reasoningEffort: 'high', approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'workspaceWrite', networkAccess: false, writableRoots: ['/worktree'],
        excludeTmpdirEnvVar: true, excludeSlashTmp: true,
      },
      runtimeWorkspaceRoots: ['/worktree'],
    })).resolves.toEqual({ turnId: 'turn-1' });
    await manager.interruptTurn('account-a', 'thread-new', 'turn-1');
    process?.notify('warning', { threadId: 'thread-new', message: 'notice' });
    expect(notifications).toHaveBeenCalledWith('warning', {
      threadId: 'thread-new', message: 'notice',
    });

    expect(process?.requests.find((request) => request.method === 'thread/start')?.params)
      .toEqual(expect.objectContaining({
        cwd: '/worktree', approvalPolicy: 'never', sandbox: 'workspace-write',
        runtimeWorkspaceRoots: ['/worktree'],
        config: { sandbox_workspace_write: { network_access: false } },
      }));
    expect(process?.requests.find((request) => request.method === 'turn/start')?.params)
      .toEqual(expect.objectContaining({
        input: [{ type: 'text', text: 'Implement it', text_elements: [] }],
        effort: 'high',
        runtimeWorkspaceRoots: ['/worktree'],
        sandboxPolicy: {
          type: 'workspaceWrite', networkAccess: false, writableRoots: ['/worktree'],
          excludeTmpdirEnvVar: true, excludeSlashTmp: true,
        },
      }));
    unsubscribe();
    await manager.retireAccount('account-a');
    expect(terminate).toHaveBeenCalledWith(process);
  });
  it('uses the canonical isolated home reported by macOS app-server', async () => {
    let spawnedHome = '';
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/var/folders/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory.startsWith('/private/')
        ? directory
        : directory.replace('/var/', '/private/var/'),
      spawn: (_path, _args, options) => {
        spawnedHome = options.env.CODEX_HOME;
        return new ScriptedProcess(spawnedHome);
      },
      terminate: vi.fn(),
    });

    await manager.readAccount('account-a');

    expect(spawnedHome).toMatch(/^\/private\/var\/folders\/aperant\/codex-accounts\//);
  });

  it('spawns one initialized process per account with stable isolated CODEX_HOME', async () => {
    const spawns: CodexAppServerSpawnOptions[] = [];
    const processes: ScriptedProcess[] = [];
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: {
        PATH: '/usr/bin',
        TEMP: '/tmp',
        SENTRY_DSN: 'sentry-secret',
        anthropic_api_key: 'anthropic-secret',
        OpenAi_Api_Key: 'openai-secret',
        AWS_SECRET_ACCESS_KEY: 'aws-secret',
        CUSTOM_TOKEN: 'token-secret',
      },
      spawn: (_path, _args, options) => {
        spawns.push(options);
        const process = new ScriptedProcess(options.env.CODEX_HOME);
        processes.push(process);
        return process;
      },
      terminate: vi.fn(),
    });

    await Promise.all([manager.readAccount('account-a'), manager.readAccount('account-a')]);
    await manager.readAccount('account-b');

    expect(processes).toHaveLength(2);
    expect(spawns[0].env.CODEX_HOME).not.toBe(spawns[1].env.CODEX_HOME);
    expect(spawns[0].env.CODEX_HOME).toMatch(/^\/tmp\/aperant\/codex-accounts\/[a-f0-9]{24}$/);
    expect(spawns[0].env.CODEX_HOME).not.toContain('account-a');
    expect(spawns[0].detached).toBe(false);
    expect(spawns[0].env.OPENAI_API_KEY).toBeUndefined();
    expect(spawns[0].env).toEqual({
      CODEX_HOME: spawns[0].env.CODEX_HOME,
      PATH: '/usr/bin',
      TEMP: '/tmp',
    });
    expect(processes[0].methods.filter((method) => method === 'initialize')).toHaveLength(1);
  });

  it('awaits asynchronous environment augmentation before spawning', async () => {
    let releaseEnvironment: ((environment: NodeJS.ProcessEnv) => void) | undefined;
    const environment = new Promise<NodeJS.ProcessEnv>((resolve) => {
      releaseEnvironment = resolve;
    });
    const getBaseEnvironment = vi.fn(() => environment);
    const spawn = vi.fn((_path, _args, options: CodexAppServerSpawnOptions) => (
      new ScriptedProcess(options.env.CODEX_HOME)
    ));
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      getBaseEnvironment,
      spawn,
      terminate: vi.fn(),
    });

    const account = manager.readAccount('account-a');
    await new Promise((resolve) => setImmediate(resolve));
    expect(getBaseEnvironment).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();

    releaseEnvironment?.({ PATH: '/async/bin', SENTRY_DSN: 'secret' });
    await account;
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/codex',
      ['app-server', '--stdio'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: '/async/bin' }),
      }),
    );
    expect(spawn.mock.calls[0][2].env.SENTRY_DSN).toBeUndefined();
    await manager.shutdown();
  });

  it('rejects Windows before CLI detection or process spawn', async () => {
    const detectCli = vi.fn();
    const spawn = vi.fn((_path, _args, options: CodexAppServerSpawnOptions) => (
      new ScriptedProcess(options.env.CODEX_HOME)
    ));
    const manager = createCodexAppServerManager({
      codexHomeRoot: 'C:\\Aperant\\codex-accounts',
      detectCli,
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      platform: 'win32',
      spawn,
      terminate: vi.fn(),
    });

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'platform-unsupported',
    });
    expect(detectCli).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects a hostile Windows command processor override', async () => {
    const spawn = vi.fn();
    const manager = createCodexAppServerManager({
      codexHomeRoot: 'C:\\Aperant\\codex-accounts',
      detectCli: async () => ({
        found: true,
        path: 'C:\\Users\\grimm\\AppData\\Roaming\\npm\\codex.cmd',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      platform: 'win32',
      spawn,
      terminate: vi.fn(),
    });

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'platform-unsupported',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fails closed when canonical account homes escape or alias another account', async () => {
    const escapedSpawn = vi.fn();
    const escaped = createCodexAppServerManager({
      codexHomeRoot: '/safe/root',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => (
        directory === '/safe/root' ? '/safe/root' : '/escaped/account'
      ),
      spawn: escapedSpawn,
      terminate: vi.fn(),
    });
    await expect(escaped.readAccount('account-a')).rejects.toMatchObject({
      code: 'isolation-failed',
    });
    expect(escapedSpawn).not.toHaveBeenCalled();

    const alias = createCodexAppServerManager({
      codexHomeRoot: '/safe/root',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => (
        directory === '/safe/root' ? '/safe/root' : '/safe/root/shared'
      ),
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate: vi.fn(),
    });
    await alias.readAccount('account-a');
    await expect(alias.readAccount('account-b')).rejects.toMatchObject({
      code: 'isolation-failed',
    });
  });

  it('routes production notifications with their owning account', async () => {
    const onNotification = vi.fn();
    let process: ScriptedProcess | undefined;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      terminate: vi.fn(),
      onNotification,
    });
    await manager.readAccount('account-a');

    process?.stdout.write(`${JSON.stringify({
      method: 'account/updated',
      params: { authMode: 'chatgpt' },
    })}\n`);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onNotification).toHaveBeenCalledWith(
      'account-a',
      'account/updated',
      { authMode: 'chatgpt' },
    );
  });

  it('refuses new work and terminates a hung initialize without awaiting it on shutdown', async () => {
    class HangingProcess extends EventEmitter implements CodexJsonlProcess {
      readonly stdout = new PassThrough();
      readonly stderr = new PassThrough();
      readonly stdin = new Writable({ write: (_chunk, _encoding, done) => done() });
      pid = 9191;
      killed = false;
      kill(): boolean {
        this.killed = true;
        return true;
      }
    }
    const process = new HangingProcess();
    let releaseTermination: (() => void) | undefined;
    const terminationReleased = new Promise<void>((resolve) => {
      releaseTermination = resolve;
    });
    const terminate = vi.fn(async (target: CodexJsonlProcess) => {
      (target as unknown as EventEmitter).emit('exit', 0, null);
      await terminationReleased;
    });
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: () => process,
      terminate,
    });
    const pending = manager.readAccount('account-a').catch((error) => error);
    await new Promise((resolve) => setImmediate(resolve));

    let stopped = false;
    const shutdown = manager.shutdown().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(stopped).toBe(false);
    expect(terminate).toHaveBeenCalledWith(process);
    releaseTermination?.();
    await shutdown;
    expect(stopped).toBe(true);
    await expect(manager.readAccount('account-b')).rejects.toMatchObject({ code: 'shutdown' });
    await pending;
  });

  it('supports account read, login start, and authenticated model list', async () => {
    const catalogHandoff = vi.fn<(accountId: string, models: ModelDescriptor[]) => void>();
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate: vi.fn(),
      onCatalogModels: catalogHandoff,
    });

    await expect(manager.readAccount('account-a')).resolves.toMatchObject({
      account: { type: 'chatgpt', planType: 'plus' },
    });
    await expect(manager.startLogin('account-a')).resolves.toMatchObject({
      type: 'chatgpt',
      authUrl: 'https://auth.openai.com/example',
    });
    const models = await manager.listModels('account-a');
    await expect(manager.verifyExecutionModel('account-a', 'gpt-5.6-codex', 'low'))
      .resolves.toBeUndefined();
    await expect(manager.verifyExecutionModel('account-a', 'missing-codex', 'low'))
      .rejects.toMatchObject({ code: 'discovery-failed' });
    await expect(manager.verifyExecutionModel('account-a', 'gpt-5.6-codex', 'high'))
      .rejects.toMatchObject({ code: 'discovery-failed' });

    expect(models).toEqual([
      expect.objectContaining({
        id: 'gpt-5.6-codex',
        provider: 'openai',
        backend: 'codex-app-server',
        availability: 'available',
        source: 'provider',
        thinking: { mode: 'manual', effortLevels: ['low', 'medium'] },
      }),
    ]);
    expect(catalogHandoff).toHaveBeenCalledWith('account-a', models);
  });

  it('collects every model/list page before publishing the catalog', async () => {
    class PagedProcess extends EventEmitter implements CodexJsonlProcess {
      readonly stdout = new PassThrough();
      readonly stderr = new PassThrough();
      readonly stdin: Writable;
      pid = 8181;
      killed = false;

      constructor(readonly codexHome: string) {
        super();
        this.stdin = new Writable({
          write: (chunk, _encoding, done) => {
            const request = JSON.parse(chunk.toString()) as {
              id: number;
              method: string;
              params?: { cursor?: string | null };
            };
            let result: unknown;
            if (request.method === 'initialize') {
              result = {
                codexHome,
                platformFamily: 'unix',
                platformOs: 'macos',
                userAgent: 'codex_cli_rs/0.144.6',
              };
            } else if (request.method === 'account/read') {
              result = {
                account: { type: 'chatgpt', email: null, planType: 'plus' },
                requiresOpenaiAuth: true,
              };
            } else if (request.method === 'model/list') {
              const model = request.params?.cursor ? 'second-codex' : 'first-codex';
              result = {
                data: [{
                  id: model,
                  model,
                  displayName: model,
                  description: model,
                  hidden: false,
                  isDefault: !request.params?.cursor,
                  defaultReasoningEffort: 'medium',
                  supportedReasoningEfforts: [],
                }],
                nextCursor: request.params?.cursor ? null : 'page-2',
              };
            }
            if (result) {
              queueMicrotask(() => this.stdout.write(
                `${JSON.stringify({ id: request.id, result })}\n`,
              ));
            }
            done();
          },
        });
      }

      kill(): boolean {
        this.killed = true;
        return true;
      }
    }

    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new PagedProcess(options.env.CODEX_HOME),
      terminate: vi.fn(),
    });

    await expect(manager.listModels('account-a')).resolves.toEqual([
      expect.objectContaining({ id: 'first-codex' }),
      expect.objectContaining({ id: 'second-codex' }),
    ]);
  });

  it('bounds model/list pages and total catalog models', async () => {
    function model(id: string) {
      return {
        id,
        model: id,
        displayName: id,
        description: id,
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: 'medium',
        supportedReasoningEfforts: [],
      };
    }

    class BoundedProcess extends EventEmitter implements CodexJsonlProcess {
      readonly stdout = new PassThrough();
      readonly stderr = new PassThrough();
      readonly stdin: Writable;
      pid = 8282;
      killed = false;
      page = 0;

      constructor(readonly codexHome: string, private readonly mode: 'pages' | 'models') {
        super();
        this.stdin = new Writable({
          write: (chunk, _encoding, done) => {
            const request = JSON.parse(chunk.toString()) as { id: number; method: string };
            let result: unknown;
            if (request.method === 'initialize') {
              result = {
                codexHome,
                platformFamily: 'unix',
                platformOs: 'macos',
                userAgent: 'codex_cli_rs/0.144.6',
              };
            } else if (request.method === 'account/read') {
              result = {
                account: { type: 'chatgpt', email: null, planType: 'plus' },
                requiresOpenaiAuth: true,
              };
            } else if (request.method === 'model/list') {
              this.page += 1;
              result = this.mode === 'pages'
                ? {
                    data: [model(`page-${this.page}`)],
                    nextCursor: this.page < 25 ? `cursor-${this.page}` : null,
                  }
                : { data: Array.from({ length: 1_001 }, (_, index) => model(`model-${index}`)) };
            }
            if (result) {
              queueMicrotask(() => this.stdout.write(
                `${JSON.stringify({ id: request.id, result })}\n`,
              ));
            }
            done();
          },
        });
      }

      kill(): boolean {
        this.killed = true;
        return true;
      }
    }

    const dependencies = (mode: 'pages' | 'models') => ({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory: string) => directory,
      spawn: (_path: string, _args: string[], options: CodexAppServerSpawnOptions) => (
        new BoundedProcess(options.env.CODEX_HOME, mode)
      ),
      terminate: vi.fn(),
    });

    await expect(createCodexAppServerManager(dependencies('pages')).listModels('account-a'))
      .rejects.toMatchObject({ code: 'protocol-error' });
    await expect(createCodexAppServerManager(dependencies('models')).listModels('account-a'))
      .rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('keeps models gated when the isolated account is unauthenticated', async () => {
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        const process = new ScriptedProcess(options.env.CODEX_HOME);
        const originalWrite = process.stdin.write.bind(process.stdin);
        vi.spyOn(process.stdin, 'write').mockImplementation((chunk: string | Uint8Array) => {
          const message = JSON.parse(chunk.toString()) as { id?: number; method: string };
          if (message.method !== 'account/read') return originalWrite(chunk);
          queueMicrotask(() => process.stdout.write(`${JSON.stringify({
            id: message.id,
            result: { account: null, requiresOpenaiAuth: true },
          })}\n`));
          return true;
        });
        return process;
      },
      terminate: vi.fn(),
    });

    await expect(manager.listModels('account-a')).rejects.toMatchObject({
      code: 'authentication-required',
    });
  });

  it('quarantines an account after unexpected process death', async () => {
    let spawnCount = 0;
    const processes: ScriptedProcess[] = [];
    const terminate = vi.fn();
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.145.0',
        runtimeValidationRequired: true,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        spawnCount += 1;
        const process = new ScriptedProcess(options.env.CODEX_HOME);
        processes.push(process);
        return process;
      },
      terminate,
    });

    await manager.readAccount('account-a');
    processes[0].emit('exit', 1, null);
    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'termination-failed',
    });

    expect(spawnCount).toBe(1);
    expect(terminate).not.toHaveBeenCalledWith(processes[0]);
  });

  it('blocks replacement until the prior account process finishes termination', async () => {
    let releaseTermination: (() => void) | undefined;
    const terminationReleased = new Promise<void>((resolve) => {
      releaseTermination = resolve;
    });
    const processes: ScriptedProcess[] = [];
    const terminate = vi.fn(async (target: CodexJsonlProcess) => {
      await terminationReleased;
      (target as unknown as EventEmitter).emit('exit', 0, null);
    });
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        const process = new ScriptedProcess(options.env.CODEX_HOME);
        processes.push(process);
        return process;
      },
      terminate,
    });
    await manager.readAccount('account-a');

    processes[0].stdout.write('malformed-json\n');
    const replacement = manager.readAccount('account-a');
    await new Promise((resolve) => setImmediate(resolve));

    expect(processes).toHaveLength(1);
    releaseTermination?.();
    await expect(replacement).resolves.toMatchObject({ account: { type: 'chatgpt' } });
    expect(processes).toHaveLength(2);
    await manager.shutdown();
  });

  it('waits for an already-quarantined account termination during shutdown', async () => {
    let releaseTermination!: () => void;
    const terminationReleased = new Promise<void>((resolve) => {
      releaseTermination = resolve;
    });
    let process: ScriptedProcess | undefined;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true, path: '/usr/bin/codex', version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      terminate: vi.fn(async (target: CodexJsonlProcess) => {
        await terminationReleased;
        (target as unknown as EventEmitter).emit('exit', 0, null);
      }),
    });
    await manager.readAccount('account-a');
    process?.stdout.write('malformed-json\n');
    await new Promise((resolve) => setImmediate(resolve));

    let shutdownSettled = false;
    const shutdown = manager.shutdown().then(() => { shutdownSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdownSettled).toBe(false);

    releaseTermination();
    await shutdown;
  });

  it('uses cooperative EOF shutdown without sending a numeric process signal', async () => {
    let process: ScriptedProcess | undefined;
    const dependencies: CodexAppServerManagerDependencies & { shutdownTimeoutMs: number } = {
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        runtimePath: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        process.kill = vi.fn(() => {
          process?.emit('exit', null, 'SIGTERM');
          return true;
        });
        process.stdin.once('finish', () => {
          Object.defineProperty(process, 'exitCode', { value: 0, configurable: true });
          queueMicrotask(() => process?.emit('exit', 0, null));
        });
        return process;
      },
      shutdownTimeoutMs: 20,
    };
    const manager = createCodexAppServerManager(dependencies);
    await manager.readAccount('account-a');

    await manager.shutdown();

    expect(process?.stdin.writableEnded).toBe(true);
    expect(process?.kill).not.toHaveBeenCalled();
  });

  it('closes the client before EOF fences a request already past getSession', async () => {
    let process: ScriptedProcess | undefined;
    const terminate = vi.fn(async (target: CodexJsonlProcess) => {
      target.stdin.end();
      (target as unknown as EventEmitter).emit('exit', 0, null);
    });
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      terminate,
    });
    await manager.readAccount('account-a');
    const accountReadCount = process?.methods.filter(
      (method) => method === 'account/read',
    ).length ?? 0;

    const lateRequest = manager.readAccount('account-a');
    const shutdown = manager.shutdown();

    await expect(lateRequest).rejects.toMatchObject({ code: 'shutdown' });
    await shutdown;
    expect(process?.methods.filter((method) => method === 'account/read')).toHaveLength(
      accountReadCount,
    );
    expect(terminate).toHaveBeenCalledOnce();
  });

  it.each(['EPIPE', 'ERR_STREAM_DESTROYED'] as const)(
    'handles stdin %s but requires a later clean child exit and cleans observers',
    async (errorCode) => {
      vi.useFakeTimers();
      try {
        let process: ScriptedProcess | undefined;
        let stdinErrorListeners = 0;
        const manager = createCodexAppServerManager({
          codexHomeRoot: '/tmp/aperant/codex-accounts',
          detectCli: async () => ({
            found: true,
            path: '/native/codex',
            version: '0.144.6',
            runtimeValidationRequired: false,
          }),
          ensureDirectory: vi.fn(async () => undefined),
          canonicalizeDirectory: async (directory) => directory,
          baseEnv: { PATH: '/usr/bin' },
          spawn: (_path, _args, options) => {
            process = new ScriptedProcess(options.env.CODEX_HOME, (target, done) => {
              stdinErrorListeners = target.stdin.listenerCount('error');
              if (stdinErrorListeners > 0) {
                done(Object.assign(new Error('closed pipe'), { code: errorCode }));
              } else {
                done();
              }
              queueMicrotask(() => target.emit('exit', 0, null));
            });
            return process;
          },
          shutdownTimeoutMs: 20,
        });
        await manager.readAccount('account-a');

        await expect(manager.shutdown()).resolves.toBeUndefined();
        expect(stdinErrorListeners).toBeGreaterThan(0);
        expect(process?.stdin.listenerCount('error')).toBe(0);
        expect(process?.stdin.listenerCount('close')).toBe(0);
        expect(process?.stdin.listenerCount('finish')).toBe(0);
        expect(process?.listenerCount('exit')).toBe(1);
        expect(process?.listenerCount('error')).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('fails shutdown on a non-EPIPE stdin error even if the child exits zero', async () => {
    let stdinErrorListeners = 0;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => new ScriptedProcess(
        options.env.CODEX_HOME,
        (process, done) => {
          stdinErrorListeners = process.stdin.listenerCount('error');
          if (stdinErrorListeners > 0) {
            done(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
          } else {
            done();
          }
          queueMicrotask(() => process.emit('exit', 0, null));
        },
      ),
      shutdownTimeoutMs: 20,
    });
    await manager.readAccount('account-a');

    await expect(manager.shutdown()).rejects.toMatchObject({ code: 'termination-failed' });
    expect(stdinErrorListeners).toBeGreaterThan(0);
  });

  it('observes stdin close but still times out without child exit', async () => {
    let stdinCloseListeners = 0;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => new ScriptedProcess(
        options.env.CODEX_HOME,
        (process, done) => {
          stdinCloseListeners = process.stdin.listenerCount('close');
          done();
        },
      ),
      shutdownTimeoutMs: 5,
    });
    await manager.readAccount('account-a');

    await expect(manager.shutdown()).rejects.toMatchObject({ code: 'termination-failed' });
    expect(stdinCloseListeners).toBeGreaterThan(0);
  });

  it('accepts stdin that finished before shutdown but still requires a clean child exit', async () => {
    let process: ScriptedProcess | undefined;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => {
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      shutdownTimeoutMs: 20,
    });
    await manager.readAccount('account-a');
    await new Promise<void>((resolve) => process?.stdin.end(resolve));
    const shutdown = manager.shutdown();
    queueMicrotask(() => process?.emit('exit', 0, null));

    await expect(shutdown).resolves.toBeUndefined();
  });

  it('retains the account barrier when cooperative shutdown times out', async () => {
    let process: ScriptedProcess | undefined;
    let spawnCount = 0;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => {
        spawnCount += 1;
        process = new ScriptedProcess(options.env.CODEX_HOME);
        return process;
      },
      shutdownTimeoutMs: 5,
    });
    await manager.readAccount('account-a');

    process?.stdout.write('malformed-json\n');

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'termination-failed',
    });
    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'termination-failed',
    });
    expect(spawnCount).toBe(1);
    expect(process?.stdin.writableEnded).toBe(true);
    expect(process?.killed).toBe(false);
  });

  it('retains the account barrier after a nonzero cooperative exit', async () => {
    let process: ScriptedProcess | undefined;
    let spawnCount = 0;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/native/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: (_path, _args, options) => {
        spawnCount += 1;
        process = new ScriptedProcess(options.env.CODEX_HOME);
        process.stdin.once('finish', () => {
          queueMicrotask(() => process?.emit('exit', 7, null));
        });
        return process;
      },
      shutdownTimeoutMs: 20,
    });
    await manager.readAccount('account-a');

    process?.stdout.write('malformed-json\n');

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'termination-failed',
    });
    expect(spawnCount).toBe(1);
    expect(process?.killed).toBe(false);
  });

  it('reports shutdown failure when process termination cannot be verified', async () => {
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => new ScriptedProcess(options.env.CODEX_HOME),
      terminate: async () => {
        throw new CodexRuntimeError('termination-failed');
      },
    });
    await manager.readAccount('account-a');

    await expect(manager.shutdown()).rejects.toMatchObject({ code: 'termination-failed' });
  });

  it('rejects a newer CLI when its initialize response drifts from the pinned schema', async () => {
    const terminate = vi.fn();
    let spawnedProcess: ScriptedProcess | undefined;
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: () => ({
        found: true,
        path: '/usr/local/bin/codex',
        version: '0.145.0',
        runtimeValidationRequired: true,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      spawn: (_path, _args, options) => {
        const process = new ScriptedProcess(options.env.CODEX_HOME);
        spawnedProcess = process;
        const originalWrite = process.stdin.write.bind(process.stdin);
        vi.spyOn(process.stdin, 'write').mockImplementation((chunk: string | Uint8Array) => {
          const message = JSON.parse(chunk.toString()) as { id?: number; method: string };
          if (message.method !== 'initialize') return originalWrite(chunk);
          queueMicrotask(() => process.stdout.write(`${JSON.stringify({
            id: message.id,
            result: { codexHome: options.env.CODEX_HOME, incompatibleField: true },
          })}\n`));
          return true;
        });
        return process;
      },
      terminate,
    });

    await expect(manager.readAccount('account-a')).rejects.toBeInstanceOf(
      Error,
    );
    expect(terminate).toHaveBeenCalledWith(spawnedProcess);
  });

  it('does not terminate a recycled PID when the client reports exit during initialize', async () => {
    class ExitingInitializeProcess extends EventEmitter implements CodexJsonlProcess {
      readonly stdout = new PassThrough();
      readonly stderr = new PassThrough();
      readonly stdin = new Writable({
        write: (_chunk, _encoding, done) => {
          this.emit('exit', 1, null);
          done();
        },
      });
      pid = 9393;
      killed = false;
      kill(): boolean {
        this.killed = true;
        return true;
      }
    }
    const terminate = vi.fn();
    const manager = createCodexAppServerManager({
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      detectCli: async () => ({
        found: true,
        path: '/usr/bin/codex',
        version: '0.144.6',
        runtimeValidationRequired: false,
      }),
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory) => directory,
      baseEnv: { PATH: '/usr/bin' },
      spawn: () => new ExitingInitializeProcess(),
      terminate,
    });

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'process-exited',
    });
    expect(terminate).not.toHaveBeenCalled();
  });

  it('rejects old and unavailable Codex CLIs with actionable errors', async () => {
    const base = {
      codexHomeRoot: '/tmp/aperant/codex-accounts',
      ensureDirectory: vi.fn(async () => undefined),
      canonicalizeDirectory: async (directory: string) => directory,
      spawn: vi.fn(),
      terminate: vi.fn(),
    };
    const missing = createCodexAppServerManager({
      ...base,
      detectCli: () => ({ found: false, message: 'Install Codex CLI' }),
    });
    await expect(missing.readAccount('account-a')).rejects.toMatchObject({
      code: 'cli-unavailable',
    });

    const old = createCodexAppServerManager({
      ...base,
      detectCli: () => ({ found: false, version: '0.143.0', message: 'requires 0.144.0' }),
    });
    await expect(old.readAccount('account-a')).rejects.toMatchObject({
      code: 'cli-unsupported',
    });
    expect(base.spawn).not.toHaveBeenCalled();
  });
});
