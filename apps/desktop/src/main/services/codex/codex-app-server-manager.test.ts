import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import {
  createCodexAppServerManager,
  type CodexAppServerSpawnOptions,
} from './codex-app-server-manager';
import type { CodexJsonlProcess } from './codex-app-server-client';

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
      canonicalizeDirectory: async (directory) => directory.replace('/var/', '/private/var/'),
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
    expect(spawns[0].env.OPENAI_API_KEY).toBeUndefined();
    expect(processes[0].methods.filter((method) => method === 'initialize')).toHaveLength(1);
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

    await expect(manager.listModels('account-a')).rejects.toThrow('not authenticated');
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
    await expect(missing.readAccount('account-a')).rejects.toThrow('Install Codex CLI');

    const old = createCodexAppServerManager({
      ...base,
      detectCli: () => ({ found: false, version: '0.143.0', message: 'requires 0.144.0' }),
    });
    await expect(old.readAccount('account-a')).rejects.toThrow('0.144.0');
    expect(base.spawn).not.toHaveBeenCalled();
  });
});
