import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import {
  parseInitializeResponse,
  type CodexClientRequestMap,
  type CodexInitializeParams,
  type CodexInitializeResponse,
} from './codex-app-server-protocol';
import { CodexRuntimeError } from './codex-errors';

export interface CodexJsonlProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  pid?: number;
  killed?: boolean;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(event: 'error', listener: (error: Error) => void): this;
  removeListener(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  removeListener(event: 'error', listener: (error: Error) => void): this;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CodexAppServerClientOptions {
  expectedCodexHome: string;
  clientVersion?: string;
  canonicalizePath?: (value: string) => string;
  initializeTimeoutMs?: number;
  maxBufferBytes?: number;
  requestTimeoutMs?: number;
  onDiagnostic?: (message: string) => void;
  onFatal?: (error: Error, processEnded: boolean) => void;
  onNotification?: (method: string, params: unknown) => void;
}

export class CodexAppServerProtocolError extends CodexRuntimeError {
  constructor(message: string) {
    super('protocol-error', message);
    this.name = 'CodexAppServerProtocolError';
  }
}

export class CodexAppServerClient {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly decoder = new StringDecoder('utf8');
  private buffer = '';
  private nextRequestId = 1;
  private initializePromise?: Promise<CodexInitializeResponse>;
  private closedError?: Error;
  private processEndReported = false;
  private readonly onStdoutData: (chunk: string | Buffer) => void;
  private readonly onStderrData: () => void;

  constructor(
    readonly process: CodexJsonlProcess,
    private readonly options: CodexAppServerClientOptions,
  ) {
    this.onStdoutData = (chunk) => this.consumeStdout(chunk);
    this.onStderrData = () => {
      options.onDiagnostic?.('Codex app-server emitted stderr output');
    };
    process.stdout.on('data', this.onStdoutData);
    process.stderr.on('data', this.onStderrData);
    process.on('error', () => this.fail(new CodexRuntimeError('process-exited'), true));
    process.on('exit', () => this.fail(new CodexRuntimeError('process-exited'), true));
  }

  get isAlive(): boolean {
    return !this.closedError;
  }

  initialize(): Promise<CodexInitializeResponse> {
    if (!this.initializePromise) {
      const params: CodexInitializeParams = {
        clientInfo: {
          name: 'aperant',
          title: 'Aperant',
          version: this.options.clientVersion ?? process.env.npm_package_version ?? 'unknown',
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      };
      this.initializePromise = this.sendRequest(
        'initialize',
        params,
        this.options.initializeTimeoutMs ?? 15_000,
      ).then((result) => {
        const parsed = parseInitializeResponse(result);
        if (!parsed) {
          throw new CodexAppServerProtocolError('Invalid initialize response from Codex app-server');
        }
        const canonicalizePath = this.options.canonicalizePath ?? ((value: string) => value);
        if (
          canonicalizePath(parsed.codexHome) !==
          canonicalizePath(this.options.expectedCodexHome)
        ) {
          throw new CodexAppServerProtocolError(
            'Codex app-server reported an unexpected CODEX_HOME; account isolation cannot be proven',
          );
        }
        this.notify('initialized');
        return parsed;
      }).catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.fail(normalized);
        throw normalized;
      });
    }
    return this.initializePromise;
  }

  request<M extends keyof CodexClientRequestMap>(
    method: M,
    params: CodexClientRequestMap[M]['params'],
  ): Promise<CodexClientRequestMap[M]['response']> {
    return this.sendRequest(
      method,
      params,
      this.options.requestTimeoutMs ?? 30_000,
    ) as Promise<CodexClientRequestMap[M]['response']>;
  }

  close(error: Error = new CodexRuntimeError('shutdown')): void {
    if (this.closedError) return;
    this.closedError = error;
    this.process.stdout.removeListener('data', this.onStdoutData);
    this.process.stderr.removeListener('data', this.onStderrData);
    this.buffer = '';
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private sendRequest(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        const error = new CodexRuntimeError('request-timeout');
        reject(error);
        this.fail(error);
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  private write(message: unknown): void {
    if (this.closedError) throw this.closedError;
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private consumeStdout(chunk: string | Buffer): void {
    if (this.closedError) return;
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    const maxBufferBytes = this.options.maxBufferBytes ?? 1024 * 1024;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, 'utf8') > maxBufferBytes) {
        this.fail(new CodexAppServerProtocolError('Codex app-server JSONL message is too large'));
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        this.fail(new CodexAppServerProtocolError('Malformed JSONL from Codex app-server'));
        return;
      }
      this.routeMessage(message);
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > maxBufferBytes) {
      this.fail(new CodexAppServerProtocolError('Codex app-server JSONL buffer limit exceeded'));
    }
  }

  private routeMessage(message: unknown): void {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      this.fail(new CodexAppServerProtocolError('Invalid message from Codex app-server'));
      return;
    }
    const record = message as Record<string, unknown>;
    if (typeof record.method === 'string' && !('id' in record)) {
      this.options.onNotification?.(record.method, record.params);
      return;
    }
    if (!Number.isSafeInteger(record.id) || (record.id as number) < 1) {
      this.fail(new CodexAppServerProtocolError('Invalid response id from Codex app-server'));
      return;
    }
    const numericId = record.id as number;
    const pending = this.pending.get(numericId);
    if (!pending) {
      this.fail(new CodexAppServerProtocolError('Unknown response id from Codex app-server'));
      return;
    }
    this.pending.delete(numericId);
    clearTimeout(pending.timer);
    if ('error' in record) {
      pending.reject(new CodexRuntimeError('rpc-error'));
      return;
    }
    if (!('result' in record)) {
      pending.reject(new CodexAppServerProtocolError('Codex app-server response has no result'));
      return;
    }
    pending.resolve(record.result);
  }

  private fail(error: Error, processEnded = false): void {
    if (processEnded && !this.processEndReported) {
      this.processEndReported = true;
      this.options.onFatal?.(error, true);
    }
    if (this.closedError) return;
    this.close(error);
    if (!processEnded) this.options.onFatal?.(error, false);
  }
}
