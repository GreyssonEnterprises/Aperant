import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  CodexAppServerClient,
  CodexAppServerProtocolError,
  type CodexJsonlProcess,
} from './codex-app-server-client';

class FakeCodexProcess extends EventEmitter implements CodexJsonlProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: unknown[] = [];
  readonly stdin: Writable;
  pid = 4242;
  killed = false;

  constructor(private readonly respond: (request: Record<string, unknown>) => unknown | undefined) {
    super();
    let buffered = '';
    this.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        buffered += chunk.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          const request = JSON.parse(line) as Record<string, unknown>;
          this.requests.push(request);
          const response = this.respond(request);
          if (response !== undefined) {
            queueMicrotask(() => this.send(response));
          }
        }
        done();
      },
    });
  }

  send(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

function initializeResult(codexHome = '/tmp/aperant-codex/account-a') {
  return {
    codexHome,
    platformFamily: 'unix',
    platformOs: 'macos',
    userAgent: 'codex_cli_rs/0.144.6',
    ignoredFutureField: true,
  };
}

describe('Codex app-server JSONL client', () => {
  it('completes initialize before sending initialized and normal requests', async () => {
    const process = new FakeCodexProcess((request) => {
      if (request.method === 'initialize') {
        return { id: request.id, result: initializeResult() };
      }
      if (request.method === 'account/read') {
        return { id: request.id, result: { account: null, requiresOpenaiAuth: true } };
      }
      return undefined;
    });
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });

    await client.initialize();
    await client.request('account/read', { refreshToken: false });

    expect(process.requests).toEqual([
      {
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: { name: 'aperant', title: 'Aperant', version: expect.any(String) },
          capabilities: { experimentalApi: false, requestAttestation: false },
        },
      },
      { method: 'initialized' },
      { id: 2, method: 'account/read', params: { refreshToken: false } },
    ]);
  });

  it('correlates concurrent responses received out of order', async () => {
    const process = new FakeCodexProcess((request) => (
      request.method === 'initialize'
        ? { id: request.id, result: initializeResult() }
        : undefined
    ));
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    await client.initialize();

    const first = client.request('account/read', { refreshToken: false });
    const second = client.request('model/list', {});
    process.send({ id: 3, result: 'second' });
    process.send({ id: 2, result: 'first' });

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('routes notifications without confusing them with responses', async () => {
    const onNotification = vi.fn();
    const process = new FakeCodexProcess((request) => (
      request.method === 'initialize'
        ? { id: request.id, result: initializeResult() }
        : undefined
    ));
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
      onNotification,
    });
    await client.initialize();

    process.send({ method: 'account/updated', params: { authMode: 'chatgpt' } });
    await new Promise((resolve) => setImmediate(resolve));

    expect(onNotification).toHaveBeenCalledWith('account/updated', { authMode: 'chatgpt' });
  });

  it('fails pending requests on malformed JSON and process exit', async () => {
    const firstProcess = new FakeCodexProcess((request) => (
      request.method === 'initialize'
        ? { id: request.id, result: initializeResult() }
        : undefined
    ));
    const client = new CodexAppServerClient(firstProcess, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    await client.initialize();
    const malformedRequest = client.request('model/list', {});
    firstProcess.stdout.write('{malformed}\n');
    await expect(malformedRequest).rejects.toBeInstanceOf(CodexAppServerProtocolError);

    const secondProcess = new FakeCodexProcess((request) => (
      request.method === 'initialize'
        ? { id: request.id, result: initializeResult() }
        : undefined
    ));
    const secondClient = new CodexAppServerClient(secondProcess, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    await secondClient.initialize();
    const exitedRequest = secondClient.request('model/list', {});
    secondProcess.emit('exit', 17, null);
    await expect(exitedRequest).rejects.toMatchObject({ code: 'process-exited' });
  });

  it('rejects invalid initialize shapes and a mismatched isolated home', async () => {
    const invalidShape = new FakeCodexProcess((request) => ({
      id: request.id,
      result: { codexHome: '/tmp/wrong' },
    }));
    const invalidClient = new CodexAppServerClient(invalidShape, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    await expect(invalidClient.initialize()).rejects.toBeInstanceOf(CodexAppServerProtocolError);

    const wrongHome = new FakeCodexProcess((request) => ({
      id: request.id,
      result: initializeResult('/Users/someone/.codex'),
    }));
    const wrongHomeClient = new CodexAppServerClient(wrongHome, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    await expect(wrongHomeClient.initialize()).rejects.toThrow('CODEX_HOME');
  });

  it('accepts equivalent canonical paths when the OS resolves a symlinked home', async () => {
    const process = new FakeCodexProcess((request) => ({
      id: request.id,
      result: initializeResult('/private/tmp/aperant-codex/account-a'),
    }));
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
      canonicalizePath: (value) => value.replace(/^\/tmp\//, '/private/tmp/'),
    });

    await expect(client.initialize()).resolves.toMatchObject({
      codexHome: '/private/tmp/aperant-codex/account-a',
    });
  });

  it('reports stderr without forwarding possible secrets', async () => {
    const onDiagnostic = vi.fn();
    const process = new FakeCodexProcess((request) => ({
      id: request.id,
      result: initializeResult(),
    }));
    new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
      onDiagnostic,
    });

    process.stderr.write('Authorization: Bearer secret-token\n');
    await new Promise((resolve) => setImmediate(resolve));

    expect(onDiagnostic).toHaveBeenCalledWith('Codex app-server emitted stderr output');
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('secret-token');
  });

  it('times out unanswered requests and initialize handshakes', async () => {
    vi.useFakeTimers();
    try {
      const process = new FakeCodexProcess(() => undefined);
      const client = new CodexAppServerClient(process, {
        expectedCodexHome: '/tmp/aperant-codex/account-a',
        initializeTimeoutMs: 20,
        requestTimeoutMs: 10,
      });

      const request = client.request('model/list', {});
      const requestExpectation = expect(request).rejects.toMatchObject({ code: 'request-timeout' });
      await vi.advanceTimersByTimeAsync(11);
      await requestExpectation;

      const initializeProcess = new FakeCodexProcess(() => undefined);
      const initializeClient = new CodexAppServerClient(initializeProcess, {
        expectedCodexHome: '/tmp/aperant-codex/account-b',
        initializeTimeoutMs: 20,
        requestTimeoutMs: 10,
      });
      const initialize = initializeClient.initialize();
      const initializeExpectation = expect(initialize).rejects.toMatchObject({
        code: 'request-timeout',
      });
      await vi.advanceTimersByTimeAsync(21);
      await initializeExpectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects string and unknown response IDs without correlating them', async () => {
    const stringProcess = new FakeCodexProcess(() => undefined);
    const stringClient = new CodexAppServerClient(stringProcess, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    const stringPending = stringClient.request('model/list', {});
    stringProcess.send({ id: '1', result: {} });
    await expect(stringPending).rejects.toMatchObject({ code: 'protocol-error' });

    const unknownProcess = new FakeCodexProcess(() => undefined);
    const unknownClient = new CodexAppServerClient(unknownProcess, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });
    const unknownPending = unknownClient.request('model/list', {});
    unknownProcess.send({ id: 99, result: {} });
    await expect(unknownPending).rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('bounds incomplete JSONL input before it can exhaust memory', async () => {
    const process = new FakeCodexProcess(() => undefined);
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
      maxBufferBytes: 16,
    });
    const pending = client.request('model/list', {});

    process.stdout.write('x'.repeat(17));

    await expect(pending).rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('redacts raw JSON-RPC error text into a typed public error', async () => {
    const process = new FakeCodexProcess((request) => ({
      id: request.id,
      error: { code: -32_000, message: 'Bearer rpc-super-secret' },
    }));
    const client = new CodexAppServerClient(process, {
      expectedCodexHome: '/tmp/aperant-codex/account-a',
    });

    const error = await client.request('account/read', { refreshToken: false })
      .catch((caught) => caught);

    expect(error).toMatchObject({ code: 'rpc-error', message: 'Codex app-server request failed' });
    expect(JSON.stringify(error)).not.toContain('rpc-super-secret');
  });
});
