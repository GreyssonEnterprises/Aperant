import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import { terminateProcessTree } from '../../platform';
import {
  createCodexAppServerManager,
  type CodexAppServerSpawnOptions,
} from './codex-app-server-manager';
import type { CodexJsonlProcess } from './codex-app-server-client';
import { CodexRuntimeError } from './codex-errors';

class ScriptedProcess extends EventEmitter implements CodexJsonlProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin: Writable;
  readonly methods: string[] = [];
  pid = 8080;
  killed = false;

  constructor(readonly codexHome: string) {
    super();
    let buffered = '';
    this.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        buffered += chunk.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          const request = JSON.parse(line) as { id?: number; method: string };
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
            }
          });
        }
        done();
      },
    });
  }

  private reply(id: number | undefined, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe('per-account Codex app-server manager', () => {
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
    expect(spawns[0].detached).toBe(true);
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

  it('spawns npm codex.cmd through a secure cmd.exe wrapper', async () => {
    const spawn = vi.fn((_path, _args, options: CodexAppServerSpawnOptions) => (
      new ScriptedProcess(options.env.CODEX_HOME)
    ));
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
      comSpec: 'C:\\Windows\\System32\\cmd.exe',
      isSecurePath: () => true,
      spawn,
      terminate: vi.fn(),
    });

    await manager.readAccount('account-a');

    expect(spawn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', expect.stringContaining('codex.cmd" app-server --stdio')],
      expect.objectContaining({
        detached: false,
        shell: false,
        windowsVerbatimArguments: true,
      }),
    );
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
      comSpec: 'C:\\Temp\\hostile.cmd',
      isSecurePath: () => true,
      spawn,
      terminate: vi.fn(),
    });

    await expect(manager.readAccount('account-a')).rejects.toMatchObject({
      code: 'spawn-failed',
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

  it('runtime-validates a newer CLI and restarts after process death', async () => {
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
    await manager.readAccount('account-a');

    expect(spawnCount).toBe(2);
    expect(terminate).not.toHaveBeenCalledWith(processes[0]);
    await manager.shutdown();
    expect(terminate).toHaveBeenCalledWith(processes[1]);
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

  it('escalates from SIGTERM to SIGKILL and requires a verified exit', async () => {
    class ResistantProcess extends EventEmitter implements CodexJsonlProcess {
      readonly stdout = new PassThrough();
      readonly stderr = new PassThrough();
      readonly stdin = new Writable({ write: (_chunk, _encoding, done) => done() });
      readonly signals: Array<NodeJS.Signals | undefined> = [];
      pid = 9292;
      killed = false;
      kill(signal?: NodeJS.Signals): boolean {
        this.killed = true;
        this.signals.push(signal);
        if (signal === 'SIGKILL') queueMicrotask(() => this.emit('exit', null, 'SIGKILL'));
        return true;
      }
    }
    const process = new ResistantProcess();

    await terminateProcessTree(process as unknown as import('node:child_process').ChildProcess, {
      platform: 'darwin',
      processGroup: false,
      gracefulTimeoutMs: 1,
      forceTimeoutMs: 20,
    });

    expect(process.signals).toEqual(['SIGTERM', 'SIGKILL']);

    const unkillable = new ResistantProcess();
    unkillable.kill = vi.fn((signal?: NodeJS.Signals) => {
      unkillable.signals.push(signal);
      return true;
    });
    await expect(terminateProcessTree(
      unkillable as unknown as import('node:child_process').ChildProcess,
      { platform: 'darwin', processGroup: false, gracefulTimeoutMs: 1, forceTimeoutMs: 1 },
    )).rejects.toThrow('Process tree termination could not be verified');
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
