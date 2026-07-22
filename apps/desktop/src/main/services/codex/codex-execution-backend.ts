import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { SessionResult, TokenUsage } from '../../ai/session/types';
import {
  translateCodexNotification,
  type CodexTranslatedEvent,
} from './codex-event-translator';
import type { CodexSandboxProbe } from './codex-sandbox-probe';
import {
  buildCodexReadOnlyPolicy,
  buildCodexWorkspaceWritePolicy,
  type CodexSandboxPolicy,
} from './codex-sandbox-policy';

export type CodexSandboxMode = 'workspace-write' | 'read-only';

export interface CodexExecutionThreadOptions {
  cwd: string;
  runtimeWorkspaceRoots: string[];
  model: string;
  developerInstructions: string;
  approvalPolicy: 'never';
  sandbox: CodexSandboxMode;
  networkAccess: false;
}

export interface CodexExecutionTurnOptions {
  threadId: string;
  input: string;
  cwd: string;
  model: string;
  runtimeWorkspaceRoots: string[];
  reasoningEffort?: string;
  outputSchema?: unknown;
  approvalPolicy: 'never';
  sandboxPolicy: CodexSandboxPolicy;
}

export interface CodexExecutionManager {
  subscribe(accountId: string, callback: (method: string, params: unknown) => void): () => void;
  subscribeLifecycle(
    accountId: string,
    callback: (event: CodexAccountLifecycleEvent) => void,
  ): () => void;
  getRuntimeVersion(accountId: string): Promise<string>;
  verifyExecutionModel(
    accountId: string,
    modelId: string,
    reasoningEffort?: string,
  ): Promise<void>;
  startThread(
    accountId: string,
    options: CodexExecutionThreadOptions,
  ): Promise<{ threadId: string; runtimeVersion: string }>;
  resumeThread(
    accountId: string,
    options: CodexExecutionThreadOptions & { threadId: string },
  ): Promise<{ threadId: string; runtimeVersion: string }>;
  startTurn(
    accountId: string,
    options: CodexExecutionTurnOptions,
  ): Promise<{ turnId: string }>;
  interruptTurn(accountId: string, threadId: string, turnId: string): Promise<void>;
  retireAccount(accountId: string): Promise<void>;
}

export type CodexAccountLifecycleEvent =
  | { type: 'process-death'; retryable: true }
  | { type: 'retiring' }
  | { type: 'retired' }
  | { type: 'termination-failed'; retryable: true };

export interface CodexSessionMetadata {
  schemaVersion: 1;
  threadId: string;
  accountId: string;
  modelId: string;
  worktreePath: string;
  codexVersion: string;
  updatedAt: string;
}

export interface CodexSessionMetadataStore {
  read(specDir: string, phase: string): Promise<CodexSessionMetadata | undefined>;
  write(specDir: string, phase: string, metadata: CodexSessionMetadata): Promise<void>;
}

export interface CodexExecutionConfig {
  taskId: string;
  accountId: string;
  modelId: string;
  reasoningEffort?: string;
  systemPrompt: string;
  input: string;
  worktreePath: string;
  sandboxMode?: CodexSandboxMode;
  allowedWritePaths: readonly string[];
  specDir: string;
  phase: string;
  outputSchema?: unknown;
}

export type CodexExecutionOutput = CodexTranslatedEvent;

const CODEX_HOST_OWNERSHIP_INSTRUCTIONS = [
  'Codex owns code edits, shell commands, and tests inside the provided worktree.',
  'Aperant owns Git metadata, worktrees, branches, commits, pushes, and pull requests.',
  'Do not modify .git, create or switch branches, commit, push, or open pull requests.',
].join(' ');

interface Dependencies {
  manager: CodexExecutionManager;
  store: CodexSessionMetadataStore;
  sandboxProbe: Pick<CodexSandboxProbe, 'verify'>;
  cancellationGraceMs?: number;
  canonicalizePath?: (value: string) => Promise<string>;
  now?: () => Date;
}

const FORBIDDEN_OUTPUT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_OUTPUT_DEPTH = 12;
const MAX_OUTPUT_NODES = 512;
const MAX_TOOL_LIFECYCLE_KEYS = 1024;

function isSafeStructuredOutput(value: unknown, depth = 0, nodes = { count: 0 }): boolean {
  nodes.count += 1;
  if (nodes.count > MAX_OUTPUT_NODES || depth > MAX_OUTPUT_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((entry) => isSafeStructuredOutput(entry, depth + 1, nodes));
  }
  if (typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).every((key) => !FORBIDDEN_OUTPUT_KEYS.has(key)) &&
    Object.values(object).every((entry) => isSafeStructuredOutput(entry, depth + 1, nodes));
}

function runtimeCompatible(saved: string, current: string): boolean {
  const savedMatch = /^(\d+)\.(\d+)(?:\.|$)/.exec(saved);
  const currentMatch = /^(\d+)\.(\d+)(?:\.|$)/.exec(current);
  return !!savedMatch && !!currentMatch &&
    savedMatch[1] === currentMatch[1] && savedMatch[2] === currentMatch[2];
}

function isContained(root: string, candidate: string): boolean {
  if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function isContainedOrEqual(root: string, candidate: string): boolean {
  return root === candidate || isContained(root, candidate);
}

function validAccountId(value: string): boolean {
  return value === value.trim() && /^[A-Za-z0-9._:@-]{1,256}$/.test(value);
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function createCodexExecutionBackend(dependencies: Dependencies) {
  interface ActiveExecution {
    token: symbol;
    accountId: string;
    threadId?: string;
    turnId?: string;
    settled: boolean;
    cancelRequested: boolean;
    terminalSeen: boolean;
    unsubscribe?: () => void;
    unsubscribeLifecycle?: () => void;
    startupSettled: Promise<void>;
    settleStartup: () => void;
    completion: Promise<SessionResult>;
    complete: (result: SessionResult) => void;
    reject: (error: unknown) => void;
    latestUsage: TokenUsage;
    startedAt: number;
    toolCallCount: number;
    seenToolLifecycle: Set<string>;
    latestCompletedMessage?: string;
  }
  let active: ActiveExecution | undefined;

  function result(
    execution: ActiveExecution,
    outcome: SessionResult['outcome'],
    error?: SessionResult['error'],
  ): SessionResult {
    let structuredOutput: Record<string, unknown> | undefined;
    if (execution.latestCompletedMessage) {
      try {
        const parsed = JSON.parse(execution.latestCompletedMessage) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          isSafeStructuredOutput(parsed)) {
          structuredOutput = parsed as Record<string, unknown>;
        }
      } catch {
        // Plain text completions aren't structured output.
      }
    }
    return {
      outcome,
      stepsExecuted: outcome === 'completed' ? 1 : 0,
      usage: execution.latestUsage,
      messages: [],
      durationMs: Math.max(0, Date.now() - execution.startedAt),
      toolCallCount: execution.toolCallCount,
      ...(structuredOutput ? { structuredOutput } : {}),
      ...(error ? { error } : {}),
    };
  }

  function cleanup(execution: ActiveExecution): void {
    execution.unsubscribe?.();
    execution.unsubscribe = undefined;
    execution.unsubscribeLifecycle?.();
    execution.unsubscribeLifecycle = undefined;
  }

  function finish(execution: ActiveExecution, value: SessionResult): void {
    if (execution.settled) return;
    execution.settled = true;
    cleanup(execution);
    execution.complete(value);
  }

  function failStartup(execution: ActiveExecution, error: unknown): void {
    if (execution.settled) return;
    execution.settled = true;
    cleanup(execution);
    execution.reject(error);
  }

  function checkpointCancellation(execution: ActiveExecution): boolean {
    if (execution.settled) return true;
    if (!execution.cancelRequested || execution.turnId) return false;
    finish(execution, result(execution, 'cancelled'));
    return true;
  }

  function processNotification(
    execution: ActiveExecution,
    method: string,
    params: unknown,
    emit: (event: CodexExecutionOutput) => void,
  ): void {
    if (execution.settled || execution.terminalSeen ||
      !execution.threadId || !execution.turnId) return;
    for (const event of translateCodexNotification(method, params, {
      threadId: execution.threadId,
      turnId: execution.turnId,
    })) {
      if (execution.settled || execution.terminalSeen) break;
      if (event.type === 'stream-event') {
        if (event.data.type === 'tool-call' || event.data.type === 'tool-result') {
          const lifecycleKey = `${event.data.type}:${event.data.toolName}:${event.data.toolCallId}`;
          if (execution.seenToolLifecycle.has(lifecycleKey)) continue;
          if (execution.seenToolLifecycle.size >= MAX_TOOL_LIFECYCLE_KEYS) {
            const oldest = execution.seenToolLifecycle.values().next().value;
            if (oldest !== undefined) execution.seenToolLifecycle.delete(oldest);
          }
          execution.seenToolLifecycle.add(lifecycleKey);
        }
        if (event.data.type === 'usage-update') execution.latestUsage = event.data.usage;
        if (event.data.type === 'tool-call') execution.toolCallCount += 1;
      }
      if (event.type === 'message-completed') execution.latestCompletedMessage = event.text;
      emit(event);
      if (event.type !== 'terminal') continue;
      execution.terminalSeen = true;
      if (event.status === 'completed') finish(execution, result(execution, 'completed'));
      else if (event.status === 'interrupted') finish(execution, result(execution, 'cancelled'));
      else finish(execution, result(execution, 'error', {
        code: 'codex-turn-failed',
        message: event.error ?? 'Codex turn failed',
        retryable: true,
      }));
      break;
    }
  }

  async function start(
    execution: ActiveExecution,
    config: CodexExecutionConfig,
    emit: (event: CodexExecutionOutput) => void,
  ): Promise<void> {
    try {
      const canonicalizePath = dependencies.canonicalizePath ?? realpath;
      let worktreePath: string;
      let specDir: string;
      let allowedWritePaths: string[];
      const sandboxMode = config.sandboxMode ?? 'workspace-write';
      try {
        worktreePath = await canonicalizePath(config.worktreePath);
        specDir = await canonicalizePath(config.specDir);
        const invalidWritePathCount = sandboxMode === 'read-only'
          ? config.allowedWritePaths.length !== 0
          : config.allowedWritePaths.length < 1 || config.allowedWritePaths.length > 8;
        if (invalidWritePathCount) {
          throw new Error('invalid writable root count');
        }
        allowedWritePaths = [...new Set(await Promise.all(
          config.allowedWritePaths.map((writePath) => canonicalizePath(writePath)),
        ))];
      } catch {
        throw new Error('Codex execution paths could not be canonicalized');
      }
      if (!isContained(worktreePath, specDir)) {
        throw new Error('Codex spec directory must be inside the task worktree');
      }
      if (allowedWritePaths.some((writePath) => !isContainedOrEqual(worktreePath, writePath))) {
        throw new Error('Codex writable roots must be inside the task worktree');
      }
      if (checkpointCancellation(execution)) return;
      if (sandboxMode === 'workspace-write') {
        await dependencies.sandboxProbe.verify(
          config.accountId,
          worktreePath,
          allowedWritePaths,
        );
      }
      if (checkpointCancellation(execution)) return;
      const saved = await dependencies.store.read(specDir, config.phase);
      if (checkpointCancellation(execution)) return;
      const runtimeVersion = await dependencies.manager.getRuntimeVersion(config.accountId);
      if (checkpointCancellation(execution)) return;
      await dependencies.manager.verifyExecutionModel(
        config.accountId,
        config.modelId,
        config.reasoningEffort,
      );
      if (checkpointCancellation(execution)) return;
      const threadOptions: CodexExecutionThreadOptions = {
        cwd: worktreePath,
        runtimeWorkspaceRoots: allowedWritePaths,
        model: config.modelId,
        developerInstructions: `${config.systemPrompt}\n\n${CODEX_HOST_OWNERSHIP_INSTRUCTIONS}`,
        approvalPolicy: 'never',
        sandbox: sandboxMode,
        networkAccess: false,
      };
      let thread: { threadId: string; runtimeVersion: string };
      if (saved && saved.schemaVersion === 1 && saved.accountId === config.accountId &&
        saved.modelId === config.modelId && saved.worktreePath === worktreePath &&
        runtimeCompatible(saved.codexVersion, runtimeVersion)) {
        try {
          thread = await dependencies.manager.resumeThread(config.accountId, {
            ...threadOptions,
            threadId: saved.threadId,
          });
        } catch {
          if (checkpointCancellation(execution)) return;
          emit({
            type: 'warning',
            message: 'Saved Codex session did not match this account, worktree, or runtime; started a fresh session',
          });
          thread = await dependencies.manager.startThread(config.accountId, threadOptions);
        }
      } else {
        if (saved) {
          emit({
            type: 'warning',
            message: 'Saved Codex session did not match this account, worktree, or runtime; started a fresh session',
          });
        }
        thread = await dependencies.manager.startThread(config.accountId, threadOptions);
      }
      execution.threadId = thread.threadId;
      if (checkpointCancellation(execution)) return;

      await dependencies.store.write(specDir, config.phase, {
        schemaVersion: 1,
        threadId: thread.threadId,
        accountId: config.accountId,
        modelId: config.modelId,
        worktreePath,
        codexVersion: thread.runtimeVersion,
        updatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      });
      if (checkpointCancellation(execution)) return;

      const pendingEvents: Array<[string, unknown]> = [];
      execution.unsubscribe = dependencies.manager.subscribe(config.accountId, (method, params) => {
        if (execution.settled || execution.terminalSeen) return;
        if (!execution.turnId) {
          if (pendingEvents.length < 128) pendingEvents.push([method, params]);
          return;
        }
        processNotification(execution, method, params, emit);
      });
      if (checkpointCancellation(execution)) return;

      const turn = await dependencies.manager.startTurn(config.accountId, {
        threadId: thread.threadId,
        input: config.input,
        cwd: worktreePath,
        model: config.modelId,
        runtimeWorkspaceRoots: allowedWritePaths,
        ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
        ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
        approvalPolicy: 'never',
        sandboxPolicy: sandboxMode === 'read-only'
          ? buildCodexReadOnlyPolicy()
          : buildCodexWorkspaceWritePolicy(allowedWritePaths),
      });
      execution.turnId = turn.turnId;
      for (const [method, params] of pendingEvents) {
        processNotification(execution, method, params, emit);
        if (execution.settled || execution.terminalSeen) break;
      }
    } catch (error) {
      if (execution.cancelRequested) finish(execution, result(execution, 'cancelled'));
      else failStartup(execution, error);
    } finally {
      execution.settleStartup();
    }
  }

  return {
    get isActive() {
      return !!active && !active.settled;
    },

    run(
      config: CodexExecutionConfig,
      emit: (event: CodexExecutionOutput) => void,
    ): Promise<SessionResult> {
      if (!validAccountId(config.accountId)) {
        return Promise.reject(new Error('Invalid Codex account authorization'));
      }
      if (active && !active.settled) {
        return Promise.reject(new Error('Codex execution is already active'));
      }
      let complete!: (value: SessionResult) => void;
      let reject!: (error: unknown) => void;
      let settleStartup!: () => void;
      const completion = new Promise<SessionResult>((resolve, rejectPromise) => {
        complete = resolve;
        reject = rejectPromise;
      });
      const startupSettled = new Promise<void>((resolve) => { settleStartup = resolve; });
      const execution: ActiveExecution = {
        token: Symbol(config.taskId),
        accountId: config.accountId,
        settled: false,
        cancelRequested: false,
        terminalSeen: false,
        startupSettled,
        settleStartup,
        completion,
        complete,
        reject,
        latestUsage: emptyUsage(),
        startedAt: Date.now(),
        toolCallCount: 0,
        seenToolLifecycle: new Set(),
      };
      active = execution;
      const unsubscribeLifecycle = dependencies.manager.subscribeLifecycle(
        config.accountId,
        (event) => {
          if (event.type === 'retiring') return;
          if (event.type === 'retired') {
            if (execution.cancelRequested) finish(execution, result(execution, 'cancelled'));
            else finish(execution, result(execution, 'error', {
              code: 'account-retired',
              message: 'Codex account session was retired before the task completed',
              retryable: true,
            }));
            return;
          }
          finish(execution, result(execution, 'error', {
            code: event.type === 'process-death'
              ? 'account-process-ended'
              : 'termination-failed',
            message: event.type === 'process-death'
              ? 'Codex account process ended before the task completed'
              : 'Codex session could not be stopped safely',
            retryable: event.retryable,
          }));
        },
      );
      execution.unsubscribeLifecycle = unsubscribeLifecycle;
      if (execution.settled) {
        unsubscribeLifecycle();
        execution.unsubscribeLifecycle = undefined;
      }
      void start(execution, config, emit);
      return completion;
    },

    async cancel(): Promise<SessionResult | undefined> {
      if (!active) return;
      const current = active;
      if (current.settled) return current.completion;
      current.cancelRequested = true;
      await current.startupSettled;
      if (current.settled) return current.completion;
      if (!current.threadId || !current.turnId) {
        finish(current, result(current, 'cancelled'));
        return current.completion;
      }
      try {
        await dependencies.manager.interruptTurn(
          current.accountId,
          current.threadId,
          current.turnId,
        );
      } catch {
        // Continue to cooperative retirement; raw transport errors stay main-only.
      }
      await Promise.race([
        current.completion.then(() => undefined, () => undefined),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, dependencies.cancellationGraceMs ?? 5_000);
          timer.unref?.();
        }),
      ]);
      if (current.settled) return current.completion;
      try {
        await dependencies.manager.retireAccount(current.accountId);
        finish(current, result(current, 'cancelled'));
      } catch {
        finish(current, result(current, 'error', {
          code: 'termination-failed',
          message: 'Codex session could not be stopped safely',
          retryable: true,
        }));
      }
      return current.completion;
    },
  };
}
