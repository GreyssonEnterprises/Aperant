import type { SessionResult, TokenUsage } from '../../ai/session/types';
import {
  translateCodexNotification,
  type CodexTranslatedEvent,
} from './codex-event-translator';

export interface CodexExecutionThreadOptions {
  cwd: string;
  model: string;
  developerInstructions: string;
  approvalPolicy: 'never';
  sandbox: 'workspace-write';
  networkAccess: false;
}

export interface CodexExecutionTurnOptions {
  threadId: string;
  input: string;
  cwd: string;
  model: string;
  reasoningEffort?: string;
  outputSchema?: unknown;
  approvalPolicy: 'never';
  sandboxPolicy: {
    type: 'workspaceWrite';
    networkAccess: false;
    writableRoots: string[];
    excludeTmpdirEnvVar: true;
    excludeSlashTmp: true;
  };
}

export interface CodexExecutionManager {
  subscribe(accountId: string, callback: (method: string, params: unknown) => void): () => void;
  getRuntimeVersion(accountId: string): Promise<string>;
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

export interface CodexSessionMetadata {
  threadId: string;
  accountId: string;
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
  cancellationGraceMs?: number;
  now?: () => Date;
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function createCodexExecutionBackend(dependencies: Dependencies) {
  let active: {
    accountId: string;
    threadId: string;
    turnId: string;
    settled: boolean;
    complete: (result: SessionResult) => void;
  } | undefined;
  let unsubscribe: (() => void) | undefined;
  let latestUsage = emptyUsage();
  let startedAt = 0;
  let toolCallCount = 0;
  let latestCompletedMessage: string | undefined;

  function result(
    outcome: SessionResult['outcome'],
    error?: SessionResult['error'],
  ): SessionResult {
    let structuredOutput: Record<string, unknown> | undefined;
    if (latestCompletedMessage) {
      try {
        const parsed = JSON.parse(latestCompletedMessage) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          structuredOutput = parsed as Record<string, unknown>;
        }
      } catch {
        // Plain text completions aren't structured output.
      }
    }
    return {
      outcome,
      stepsExecuted: outcome === 'completed' ? 1 : 0,
      usage: latestUsage,
      messages: [],
      durationMs: Math.max(0, Date.now() - startedAt),
      toolCallCount,
      ...(structuredOutput ? { structuredOutput } : {}),
      ...(error ? { error } : {}),
    };
  }

  function finish(value: SessionResult): void {
    if (!active || active.settled) return;
    active.settled = true;
    unsubscribe?.();
    unsubscribe = undefined;
    active.complete(value);
  }

  return {
    get isActive() {
      return !!active && !active.settled;
    },

    async run(
      config: CodexExecutionConfig,
      emit: (event: CodexExecutionOutput) => void,
    ): Promise<SessionResult> {
      if (active && !active.settled) throw new Error('Codex execution is already active');
      startedAt = Date.now();
      latestUsage = emptyUsage();
      toolCallCount = 0;
      latestCompletedMessage = undefined;

      const saved = await dependencies.store.read(config.specDir, config.phase);
      const runtimeVersion = await dependencies.manager.getRuntimeVersion(config.accountId);
      const threadOptions: CodexExecutionThreadOptions = {
        cwd: config.worktreePath,
        model: config.modelId,
        developerInstructions: `${config.systemPrompt}\n\n${CODEX_HOST_OWNERSHIP_INSTRUCTIONS}`,
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        networkAccess: false,
      };
      let thread: { threadId: string; runtimeVersion: string };
      if (saved) {
        if (saved.accountId === config.accountId && saved.worktreePath === config.worktreePath &&
          saved.codexVersion === runtimeVersion) {
          try {
            const resumed = await dependencies.manager.resumeThread(config.accountId, {
              ...threadOptions,
              threadId: saved.threadId,
            });
            thread = resumed;
          } catch {
            emit({
              type: 'warning',
              message: 'Saved Codex session did not match this account, worktree, or runtime; started a fresh session',
            });
            thread = await dependencies.manager.startThread(config.accountId, threadOptions);
          }
        } else {
          emit({
            type: 'warning',
            message: 'Saved Codex session did not match this account, worktree, or runtime; started a fresh session',
          });
          thread = await dependencies.manager.startThread(config.accountId, threadOptions);
        }
      } else {
        thread = await dependencies.manager.startThread(config.accountId, threadOptions);
      }

      await dependencies.store.write(config.specDir, config.phase, {
        threadId: thread.threadId,
        accountId: config.accountId,
        worktreePath: config.worktreePath,
        codexVersion: thread.runtimeVersion,
        updatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      });

      let complete!: (value: SessionResult) => void;
      const completion = new Promise<SessionResult>((resolve) => { complete = resolve; });
      const pendingEvents: Array<[string, unknown]> = [];
      let turnId: string | undefined;
      unsubscribe = dependencies.manager.subscribe(config.accountId, (method, params) => {
        if (!turnId) {
          pendingEvents.push([method, params]);
          return;
        }
        for (const event of translateCodexNotification(method, params, {
          threadId: thread.threadId,
          turnId,
        })) {
          if (event.type === 'stream-event') {
            if (event.data.type === 'usage-update') latestUsage = event.data.usage;
            if (event.data.type === 'tool-call') toolCallCount += 1;
          }
          if (event.type === 'message-completed') latestCompletedMessage = event.text;
          emit(event);
          if (event.type === 'terminal') {
            if (event.status === 'completed') finish(result('completed'));
            else if (event.status === 'interrupted') finish(result('cancelled'));
            else finish(result('error', {
              code: 'codex-turn-failed',
              message: event.error ?? 'Codex turn failed',
              retryable: true,
            }));
          }
        }
      });
      let turn: { turnId: string };
      try {
        turn = await dependencies.manager.startTurn(config.accountId, {
          threadId: thread.threadId,
          input: config.input,
          cwd: config.worktreePath,
          model: config.modelId,
          ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
          ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
          approvalPolicy: 'never',
          sandboxPolicy: {
            type: 'workspaceWrite',
            networkAccess: false,
            writableRoots: [config.worktreePath],
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          },
        });
      } catch (error) {
        unsubscribe?.();
        unsubscribe = undefined;
        throw error;
      }
      turnId = turn.turnId;
      active = {
        accountId: config.accountId,
        threadId: thread.threadId,
        turnId,
        settled: false,
        complete,
      };
      for (const [method, params] of pendingEvents) {
        for (const event of translateCodexNotification(method, params, {
          threadId: thread.threadId,
          turnId,
        })) {
          if (event.type === 'stream-event') {
            if (event.data.type === 'usage-update') latestUsage = event.data.usage;
            if (event.data.type === 'tool-call') toolCallCount += 1;
          }
          if (event.type === 'message-completed') latestCompletedMessage = event.text;
          emit(event);
          if (event.type === 'terminal') {
            if (event.status === 'completed') finish(result('completed'));
            else if (event.status === 'interrupted') finish(result('cancelled'));
            else finish(result('error', {
              code: 'codex-turn-failed',
              message: event.error ?? 'Codex turn failed',
              retryable: true,
            }));
          }
        }
      }
      return completion;
    },

    async cancel(): Promise<void> {
      if (!active || active.settled) return;
      const current = active;
      try {
        await dependencies.manager.interruptTurn(
          current.accountId,
          current.threadId,
          current.turnId,
        );
      } catch {
        // Continue to cooperative retirement; raw transport errors stay main-only.
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, dependencies.cancellationGraceMs ?? 5_000);
        timer.unref?.();
      });
      if (current.settled) return;
      try {
        await dependencies.manager.retireAccount(current.accountId);
        finish(result('cancelled'));
      } catch {
        finish(result('error', {
          code: 'termination-failed',
          message: 'Codex session could not be stopped safely',
          retryable: true,
        }));
      }
    },
  };
}
