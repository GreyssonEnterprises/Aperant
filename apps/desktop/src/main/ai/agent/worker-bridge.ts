/**
 * Worker Bridge
 * =============
 *
 * Main-thread bridge that spawns a Worker thread and relays `postMessage()`
 * events to an EventEmitter matching the `AgentManagerEvents` interface.
 *
 * This allows the existing agent management system (agent-process.ts,
 * agent-events.ts) to consume worker thread events transparently — the UI
 * cannot distinguish between a Python subprocess and a TS worker thread.
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { app } from 'electron';

import type { AgentManagerEvents, ExecutionProgressData, ProcessType } from '../../agent/types';
import type { TaskEventPayload } from '../../agent/task-event-schema';
import type {
  WorkerConfig,
  WorkerMessage,
  AgentExecutorConfig,
  WorkerCodexExecuteMessage,
} from './types';
import type { SessionResult } from '../session/types';
import { ProgressTracker } from '../session/progress-tracker';
import { createMainCodexExecutionBackend } from '../../services/codex/codex-execution-runtime';
import type { CodexExecutionOutput } from '../../services/codex/codex-execution-backend';
import { CodexRuntimeError } from '../../services/codex/codex-errors';
import {
  isCodexRequestId,
  parseCodexWorkerRequest,
  type ValidatedCodexWorkerRequest,
} from '../../services/codex/codex-worker-request';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Worker Path Resolution
// =============================================================================

/**
 * Resolve the path to the worker entry point.
 * Handles both dev (source via electron-vite) and production (bundled) paths.
 */
function resolveWorkerPath(): string {
  if (app.isPackaged) {
    // Production: worker is inside app.asar at out/main/ai/agent/worker.js
    return path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'ai', 'agent', 'worker.js');
  }
  // Dev: electron-vite outputs worker at out/main/ai/agent/worker.js
  // because the Rollup input key is 'ai/agent/worker'.
  // __dirname resolves to out/main/ at runtime, so we need the subdirectory.
  return path.join(__dirname, 'ai', 'agent', 'worker.js');
}

// =============================================================================
// WorkerBridge
// =============================================================================

/**
 * Bridges a worker thread to the AgentManagerEvents interface.
 *
 * Usage:
 * ```ts
 * const bridge = new WorkerBridge();
 * bridge.on('log', (taskId, log) => { ... });
 * bridge.on('exit', (taskId, code, processType) => { ... });
 * await bridge.spawn(config);
 * ```
 */
export class WorkerBridge extends EventEmitter {
  private worker: Worker | null = null;
  private codexBackend: ReturnType<typeof createMainCodexExecutionBackend> | null = null;
  private progressTracker: ProgressTracker = new ProgressTracker();
  private taskId: string = '';
  private projectId: string | undefined;
  private processType: ProcessType = 'task-execution';
  private codexAuthorization: Readonly<{
    taskId: string;
    accountId: string;
    modelId: string;
    worktreePath: string;
    allowedWritePaths: readonly string[];
    specDir: string;
  }> | null = null;
  private lifecycleClosing = false;
  private terminalEmitted = false;
  private quarantinedFinalization: SessionResult | undefined;

  /**
   * Spawn a worker thread with the given configuration.
   * The worker will immediately begin executing the agent session.
   *
   * @param config - Executor configuration (task ID, session params, etc.)
   */
  spawn(config: AgentExecutorConfig): void {
    if (this.quarantinedFinalization) {
      throw new Error('WorkerBridge has quarantined Codex ownership and cannot be replaced');
    }
    if (this.worker) {
      throw new Error('WorkerBridge already has an active worker. Call terminate() first.');
    }

    this.taskId = config.taskId;
    this.projectId = config.projectId;
    this.processType = config.processType;
    this.progressTracker = new ProgressTracker();
    this.lifecycleClosing = false;
    this.terminalEmitted = false;
    this.codexAuthorization = config.session.executionBackend === 'codex-app-server' &&
      config.session.accountId
      ? Object.freeze({
          taskId: config.taskId,
          accountId: config.session.accountId,
          modelId: config.session.modelId,
          worktreePath: config.session.toolContext.cwd,
          allowedWritePaths: Object.freeze([
            ...(config.session.toolContext.allowedWritePaths ?? []),
          ]),
          specDir: config.session.specDir,
        })
      : null;

    const workerSession = config.session.executionBackend === 'codex-app-server'
      ? (() => {
          const {
            apiKey: _apiKey,
            baseURL: _baseURL,
            configDir: _configDir,
            oauthTokenFilePath: _oauthTokenFilePath,
            ...safeSession
          } = config.session;
          return safeSession;
        })()
      : config.session;
    const workerConfig: WorkerConfig = {
      taskId: config.taskId,
      projectId: config.projectId,
      processType: config.processType,
      session: workerSession,
    };

    const workerPath = resolveWorkerPath();

    this.worker = new Worker(workerPath, {
      workerData: workerConfig,
    });

    this.worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(message);
    });

    this.worker.on('error', (error: Error) => {
      void this.handleWorkerFailure(error);
    });

    this.worker.on('exit', (code: number) => {
      // Code 0 = clean exit; non-zero = crash/error
      // Only emit exit if we haven't already emitted from a 'result' message
      if (this.worker && !this.lifecycleClosing) void this.handleWorkerExit(code);
    });
  }

  /**
   * Terminate the worker thread.
   * Sends an abort message first for graceful shutdown, then terminates.
   */
  async terminate(): Promise<SessionResult | undefined> {
    if (this.quarantinedFinalization) return this.quarantinedFinalization;
    this.lifecycleClosing = true;
    let finalization: SessionResult | undefined;
    if (this.codexBackend) {
      finalization = await this.cancelCodexBackend();
    }
    if (finalization?.error?.retryable) this.quarantinedFinalization = finalization;
    if (!this.worker) return finalization;

    // Try graceful abort first
    try {
      this.worker.postMessage({ type: 'abort' });
    } catch {
      // Worker may already be dead
    }

    // Force terminate after a short grace period
    const worker = this.worker;
    this.cleanup(!!this.quarantinedFinalization);

    try {
      await worker.terminate();
    } catch {
      // Already terminated
    }
    return finalization;
  }

  /** Whether the worker is currently active */
  get isActive(): boolean {
    return this.worker !== null || !!this.quarantinedFinalization;
  }

  /** Get the underlying Worker instance (for advanced use) */
  get workerInstance(): Worker | null {
    return this.worker;
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  private handleCodexExecute(message: WorkerCodexExecuteMessage): void {
    if (!this.worker) return;
    if (!isCodexRequestId(message.requestId)) return;
    let request: ValidatedCodexWorkerRequest;
    try {
      request = parseCodexWorkerRequest(message.data);
    } catch {
      this.worker.postMessage({
        type: 'codex-error',
        requestId: message.requestId,
        message: 'Invalid Codex worker request',
      });
      return;
    }
    const authorization = this.codexAuthorization;
    if (!authorization) {
      this.worker.postMessage({
        type: 'codex-error',
        requestId: message.requestId,
        message: 'Codex execution is not authorized for this task',
      });
      return;
    }
    if (this.codexBackend?.isActive) {
      this.worker.postMessage({
        type: 'codex-error',
        requestId: message.requestId,
        message: 'Another Codex session is already active for this task',
      });
      return;
    }
    const backend = createMainCodexExecutionBackend();
    this.codexBackend = backend;
    void backend.run({
      ...authorization,
      ...request,
    }, (event) => this.handleCodexEvent(event)).then(
      (result) => this.worker?.postMessage({
        type: 'codex-result',
        requestId: message.requestId,
        result,
      }),
      (error: unknown) => {
        const publicMessage = error instanceof CodexRuntimeError
          ? error.message
          : 'Codex execution could not be started';
        this.worker?.postMessage({
          type: 'codex-error',
          requestId: message.requestId,
          message: publicMessage,
        });
      },
    ).finally(() => {
      if (this.codexBackend === backend) this.codexBackend = null;
    });
  }

  private async cancelCodexBackend(): Promise<SessionResult | undefined> {
    const backend = this.codexBackend;
    if (!backend) return;
    try {
      return await backend.cancel();
    } catch {
      return {
        outcome: 'error',
        stepsExecuted: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        messages: [],
        durationMs: 0,
        toolCallCount: 0,
        error: {
          code: 'termination-failed',
          message: 'Codex session could not be stopped safely',
          retryable: true,
        },
      };
    }
  }

  private async handleWorkerFailure(error: Error): Promise<void> {
    if (this.lifecycleClosing) return;
    this.lifecycleClosing = true;
    const finalization = await this.cancelCodexBackend();
    if (finalization?.error?.retryable) {
      this.quarantinedFinalization = finalization;
      this.emitTyped('error', this.taskId, finalization.error.message, this.projectId);
      this.cleanup(true);
      return;
    }
    this.emitTyped('error', this.taskId, error.message, this.projectId);
    this.emitExitOnce(1);
    this.cleanup();
  }

  private async handleWorkerExit(code: number): Promise<void> {
    if (this.lifecycleClosing) return;
    this.lifecycleClosing = true;
    const finalization = await this.cancelCodexBackend();
    if (finalization?.error?.retryable) {
      this.quarantinedFinalization = finalization;
      this.emitTyped('error', this.taskId, finalization.error.message, this.projectId);
      this.cleanup(true);
      return;
    }
    this.emitExitOnce(code === 0 ? 0 : code);
    this.cleanup();
  }

  private emitExitOnce(code: number): void {
    if (this.terminalEmitted) return;
    this.terminalEmitted = true;
    this.emitTyped('exit', this.taskId, code, this.processType, this.projectId);
  }

  private handleCodexEvent(event: CodexExecutionOutput): void {
    if (event.type === 'stream-event') {
      this.handleWorkerMessage({
        type: 'stream-event',
        taskId: this.taskId,
        projectId: this.projectId,
        data: event.data,
      });
    } else if (event.type === 'warning') {
      this.emitTyped('log', this.taskId, `Warning: ${event.message}\n`, this.projectId);
    } else if (event.type === 'rate-limit') {
      this.emitTyped('error', this.taskId, event.message, this.projectId);
    }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'log':
        this.emitTyped('log', message.taskId, message.data, message.projectId);
        break;

      case 'error':
        this.emitTyped('error', message.taskId, message.data, message.projectId);
        break;

      case 'execution-progress':
        this.emitTyped('execution-progress', message.taskId, message.data, message.projectId);
        break;

      case 'stream-event':
        // Feed the progress tracker and emit progress updates
        this.progressTracker.processEvent(message.data);
        this.emitProgressFromTracker(message.taskId, message.projectId);
        // Also forward raw log for text events
        if (message.data.type === 'text-delta') {
          this.emitTyped('log', message.taskId, message.data.text, message.projectId);
        }
        break;

      case 'task-event':
        this.emitTyped('task-event', message.taskId, message.data as TaskEventPayload, message.projectId);
        break;

      case 'result':
        this.handleResult(message.taskId, message.data, message.projectId);
        break;

      case 'codex-execute':
        this.handleCodexExecute(message);
        break;
    }
  }

  /**
   * Convert ProgressTracker state into an ExecutionProgressData event
   * and emit it to listeners.
   */
  private emitProgressFromTracker(taskId: string, projectId?: string): void {
    const state = this.progressTracker.state;
    const progressData: ExecutionProgressData = {
      phase: state.currentPhase,
      phaseProgress: 0, // Detailed progress calculated by UI from phase
      overallProgress: 0,
      currentSubtask: state.currentSubtask ?? undefined,
      message: state.currentMessage,
      completedPhases: state.completedPhases as ExecutionProgressData['completedPhases'],
    };
    this.emitTyped('execution-progress', taskId, progressData, projectId);
  }

  /**
   * Handle the final session result from the worker.
   * Maps SessionResult.outcome to an exit code.
   */
  private handleResult(taskId: string, result: SessionResult, projectId?: string): void {
    // Map outcome to exit code
    const exitCode = result.outcome === 'completed' || result.outcome === 'max_steps' || result.outcome === 'context_window' ? 0 : 1;

    // Log the result summary
    const summary = `Session complete: outcome=${result.outcome}, steps=${result.stepsExecuted}, tools=${result.toolCallCount}, duration=${result.durationMs}ms`;
    this.emitTyped('log', taskId, summary, projectId);

    if (result.error) {
      this.emitTyped('error', taskId, result.error.message, projectId);
    }

    // Emit exit and cleanup
    if (!this.terminalEmitted) {
      this.terminalEmitted = true;
      this.emitTyped('exit', taskId, exitCode, this.processType, projectId);
    }
    this.cleanup();
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Type-safe emit that matches AgentManagerEvents signatures.
   */
  private emitTyped<K extends keyof AgentManagerEvents>(
    event: K,
    ...args: Parameters<AgentManagerEvents[K]>
  ): void {
    this.emit(event, ...args);
  }

  private cleanup(preserveQuarantine = false): void {
    this.worker = null;
    this.codexBackend = null;
    this.codexAuthorization = null;
    if (!preserveQuarantine) this.quarantinedFinalization = undefined;
  }
}
