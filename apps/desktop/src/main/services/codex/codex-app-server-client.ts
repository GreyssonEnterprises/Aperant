import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import {
  parseInitializeResponse,
  type CodexInitializeResponse,
} from './codex-app-server-protocol';

export interface CodexJsonlProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  pid?: number;
  killed?: boolean;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'exit' | 'error', listener: (...args: unknown[]) => void): this;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface CodexAppServerClientOptions {
  expectedCodexHome: string;
  clientVersion?: string;
  canonicalizePath?: (value: string) => string;
  onDiagnostic?: (message: string) => void;
  onFatal?: (error: Error, processEnded: boolean) => void;
  onNotification?: (method: string, params: unknown) => void;
}

export class CodexAppServerProtocolError extends Error {
  constructor(message: string) {
    super(message);
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

  constructor(
    readonly process: CodexJsonlProcess,
    private readonly options: CodexAppServerClientOptions,
  ) {
    process.stdout.on('data', (chunk) => this.consumeStdout(chunk));
    process.stderr.on('data', () => {
      options.onDiagnostic?.('Codex app-server emitted stderr output');
    });
    process.on('error', (error) => this.fail(
      new Error(`Codex app-server failed: ${error.message}`),
      true,
    ));
    process.on('exit', (code, signal) => this.fail(new Error(
      `Codex app-server exited (${signal ?? code ?? 'unknown'})`,
    ), true));
  }

  get isAlive(): boolean {
    return !this.closedError;
  }

  initialize(): Promise<CodexInitializeResponse> {
    if (!this.initializePromise) {
      this.initializePromise = this.request('initialize', {
        clientInfo: {
          name: 'aperant',
          title: 'Aperant',
          version: this.options.clientVersion ?? '2.8.0',
        },
        capabilities: { experimentalApi: false, requestAttestation: false },
      }).then((result) => {
        const parsed = parseInitializeResponse(result);
        if (!parsed) {
          throw new CodexAppServerProtocolError('Invalid initialize response from Codex app-server');
        }
        const canonicalizePath = this.options.canonicalizePath ?? ((value: string) => {
          try {
            return realpathSync.native(value);
          } catch {
            return path.resolve(value);
          }
        });
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

  request(method: string, params: unknown): Promise<unknown> {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
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
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        this.fail(new CodexAppServerProtocolError('Malformed JSONL from Codex app-server'));
        return;
      }
      this.routeMessage(message);
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
    if (typeof record.id !== 'number' && typeof record.id !== 'string') {
      this.fail(new CodexAppServerProtocolError('Invalid response id from Codex app-server'));
      return;
    }
    const numericId = typeof record.id === 'number' ? record.id : Number(record.id);
    const pending = this.pending.get(numericId);
    if (!pending) return;
    this.pending.delete(numericId);
    if ('error' in record) {
      const error = record.error as Record<string, unknown> | undefined;
      pending.reject(new Error(
        typeof error?.message === 'string' ? error.message : 'Codex app-server request failed',
      ));
      return;
    }
    if (!('result' in record)) {
      pending.reject(new CodexAppServerProtocolError('Codex app-server response has no result'));
      return;
    }
    pending.resolve(record.result);
  }

  private fail(error: Error, processEnded = false): void {
    if (this.closedError) return;
    this.closedError = error;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.options.onFatal?.(error, processEnded);
  }
}
