import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

import type { AgentExecutorConfig, WorkerMessage } from '../types';
import type { SessionResult } from '../../session/types';

// =============================================================================
// Mocks
// =============================================================================

// Track created workers
const createdWorkers: EventEmitter[] = [];
const mockCodexRun = vi.fn();
const mockCodexCancel = vi.fn().mockResolvedValue(undefined);
let mockCodexActive = false;

vi.mock('../../../services/codex/codex-execution-runtime', () => ({
  createMainCodexExecutionBackend: () => ({
    run: (...args: unknown[]) => {
      mockCodexActive = true;
      return mockCodexRun(...args);
    },
    cancel: async () => {
      mockCodexActive = false;
      return mockCodexCancel();
    },
    get isActive() { return mockCodexActive; },
  }),
}));

vi.mock('worker_threads', () => {
  const { EventEmitter: EE } = require('events') as typeof import('events');

  class MockWorkerImpl extends EE {
    postMessage = vi.fn();
    terminate = vi.fn().mockResolvedValue(0);
    workerData: unknown;
    constructor(_path: string, opts?: { workerData?: unknown }) {
      super();
      this.workerData = opts?.workerData;
      createdWorkers.push(this);
    }
  }

  return { Worker: MockWorkerImpl };
});

function getWorker(): EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } {
  const w = createdWorkers[createdWorkers.length - 1];
  if (!w) throw new Error('No worker created');
  return w as EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };
}

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('url', () => ({
  fileURLToPath: (url: string) => url.replace('file://', ''),
}));

// Mock ProgressTracker
const mockProcessEvent = vi.fn();
vi.mock('../../session/progress-tracker', () => ({
  ProgressTracker: class {
    processEvent = mockProcessEvent;
    state = {
      currentPhase: 'initializing' as const,
      currentSubtask: null,
      currentMessage: 'Starting...',
      completedPhases: [],
    };
  },
}));

// Import after mocks
import { WorkerBridge } from '../worker-bridge';
import { translateCodexNotification } from '../../../services/codex/codex-event-translator';

// =============================================================================
// Helpers
// =============================================================================

function createConfig(overrides: Partial<AgentExecutorConfig> = {}): AgentExecutorConfig {
  return {
    taskId: 'task-123',
    projectId: 'proj-456',
    processType: 'task-execution',
    session: {
      agentType: 'coder',
      systemPrompt: 'test',
      initialMessages: [{ role: 'user', content: 'hello' }],
      maxSteps: 10,
      specDir: '/specs',
      projectDir: '/project',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      toolContext: { cwd: '/project', projectDir: '/project', specDir: '/specs' },
    },
    ...overrides,
  };
}

function createSessionResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    outcome: 'completed',
    stepsExecuted: 5,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    messages: [],
    durationMs: 3000,
    toolCallCount: 3,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('WorkerBridge', () => {
  let bridge: WorkerBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    createdWorkers.length = 0;
    mockCodexActive = false;
    mockCodexRun.mockReset();
    mockCodexCancel.mockClear();
    bridge = new WorkerBridge();
  });

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  describe('spawn', () => {
    it('creates a worker and sets isActive to true', () => {
      bridge.spawn(createConfig());
      expect(bridge.isActive).toBe(true);
      expect(createdWorkers.length).toBe(1);
    });

    it('throws if worker already active', () => {
      bridge.spawn(createConfig());
      expect(() => bridge.spawn(createConfig())).toThrow('already has an active worker');
    });

    it('routes Codex subscription execution in main without transferring credentials', async () => {
      let finish!: (value: SessionResult) => void;
      mockCodexRun.mockReturnValue(new Promise<SessionResult>((resolve) => { finish = resolve; }));
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'account-codex';
      config.session.apiKey = 'must-never-cross';
      config.session.modelId = 'gpt-5.3-codex';
      const exit = vi.fn();
      bridge.on('exit', exit);

      bridge.spawn(config);

      const worker = getWorker();
      expect(createdWorkers).toHaveLength(1);
      expect(JSON.stringify((worker as unknown as { workerData: unknown }).workerData))
        .not.toContain('must-never-cross');
      worker.emit('message', {
        type: 'codex-execute',
        requestId: 'request-1',
        data: {
          systemPrompt: 'test',
          input: 'hello',
          phase: 'coding',
        },
      } satisfies WorkerMessage);
      expect(mockCodexRun).toHaveBeenCalledWith(expect.not.objectContaining({
        apiKey: expect.anything(),
      }), expect.any(Function));
      expect(mockCodexRun).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'account-codex', modelId: 'gpt-5.3-codex', worktreePath: '/project',
      }), expect.any(Function));
      finish(createSessionResult());
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'codex-result', requestId: 'request-1', result: createSessionResult(),
      }));
      worker.emit('message', {
        type: 'result', taskId: 'task-123', projectId: 'proj-456', data: createSessionResult(),
      } satisfies WorkerMessage);
      expect(exit).toHaveBeenCalledWith('task-123', 0, 'task-execution', 'proj-456');
    });

    it('derives Codex identity and filesystem authority only from spawn configuration', async () => {
      mockCodexRun.mockReturnValue(new Promise<SessionResult>(() => undefined));
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'authorized-account';
      config.session.modelId = 'gpt-5.3-codex';
      config.session.specDir = '/authorized/worktree/specs/task-123';
      config.session.toolContext.cwd = '/authorized/worktree';
      bridge.spawn(config);

      getWorker().emit('message', {
        type: 'codex-execute',
        requestId: 'request-1',
        data: {
          phase: 'coding',
          systemPrompt: 'test',
          input: 'hello',
        },
      } as unknown as WorkerMessage);

      await vi.waitFor(() => expect(mockCodexRun).toHaveBeenCalled());
      expect(mockCodexRun).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-123',
        accountId: 'authorized-account',
        modelId: 'gpt-5.3-codex',
        worktreePath: '/authorized/worktree',
        specDir: '/authorized/worktree/specs/task-123',
      }), expect.any(Function));
      expect(mockCodexRun).toHaveBeenCalledWith(expect.not.objectContaining({
        accountId: 'attacker-account',
        worktreePath: '/private',
      }), expect.any(Function));
    });

    it('rejects worker attempts to substitute Codex authority', async () => {
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'authorized-account';
      bridge.spawn(config);

      const worker = getWorker();
      worker.emit('message', {
        type: 'codex-execute',
        requestId: 'request-1',
        data: {
          phase: 'coding', systemPrompt: 'test', input: 'hello',
          accountId: 'attacker-account', worktreePath: '/private',
        },
      } as unknown as WorkerMessage);

      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'codex-error',
        requestId: 'request-1',
        message: 'Invalid Codex worker request',
      }));
      expect(mockCodexRun).not.toHaveBeenCalled();
    });

    it('never forwards Codex command output or command details to renderer events', async () => {
      mockCodexRun.mockReturnValue(new Promise<SessionResult>(() => undefined));
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'account-codex';
      const log = vi.fn();
      bridge.on('log', log);
      bridge.spawn(config);

      getWorker().emit('message', {
        type: 'codex-execute', requestId: 'request-1',
        data: { phase: 'coding', systemPrompt: 'test', input: 'hello' },
      } satisfies WorkerMessage);
      await vi.waitFor(() => expect(mockCodexRun).toHaveBeenCalled());
      const emit = mockCodexRun.mock.calls[0]?.[1] as (event: never) => void;
      const context = { threadId: 'thread-1', turnId: 'turn-1' };
      for (const event of [
        ...translateCodexNotification('item/started', {
          ...context,
          item: {
            type: 'commandExecution', id: 'cmd-1', command: 'printf renderer-secret',
            cwd: '/private/renderer-secret', status: 'inProgress',
          },
        }, context),
        ...translateCodexNotification('item/commandExecution/outputDelta', {
          ...context, itemId: 'cmd-1', delta: 'renderer-secret',
        }, context),
        ...translateCodexNotification('item/completed', {
          ...context,
          item: {
            type: 'commandExecution', id: 'cmd-1', command: 'printf renderer-secret',
            cwd: '/private/renderer-secret', status: 'completed', exitCode: 0,
            aggregatedOutput: 'renderer-secret',
          },
        }, context),
      ]) emit(event as never);

      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(mockProcessEvent.mock.calls)).not.toContain('renderer-secret');
    });
  });

  // ---------------------------------------------------------------------------
  // Message relay
  // ---------------------------------------------------------------------------

  describe('message relay', () => {
    it('emits log events from worker log messages', () => {
      const handler = vi.fn();
      bridge.on('log', handler);
      bridge.spawn(createConfig());

      const msg: WorkerMessage = { type: 'log', taskId: 'task-123', data: 'hello', projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'hello', 'proj-456');
    });

    it('emits error events from worker error messages', () => {
      const handler = vi.fn();
      bridge.on('error', handler);
      bridge.spawn(createConfig());

      const msg: WorkerMessage = { type: 'error', taskId: 'task-123', data: 'fail', projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'fail', 'proj-456');
    });

    it('emits execution-progress events from worker progress messages', () => {
      const handler = vi.fn();
      bridge.on('execution-progress', handler);
      bridge.spawn(createConfig());

      const progressData = { phase: 'building' as const, phaseProgress: 50, overallProgress: 25 };
      const msg: WorkerMessage = { type: 'execution-progress', taskId: 'task-123', data: progressData as never, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', progressData, 'proj-456');
    });

    it('feeds stream-events to progress tracker and emits progress', () => {
      const handler = vi.fn();
      bridge.on('execution-progress', handler);
      bridge.spawn(createConfig());

      const streamEvent = { type: 'tool-call' as const, toolName: 'bash', args: {} };
      const msg: WorkerMessage = { type: 'stream-event', taskId: 'task-123', data: streamEvent as never, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(mockProcessEvent).toHaveBeenCalledWith(streamEvent);
      expect(handler).toHaveBeenCalled();
    });

    it('emits log for text-delta stream events', () => {
      const handler = vi.fn();
      bridge.on('log', handler);
      bridge.spawn(createConfig());

      const streamEvent = { type: 'text-delta' as const, text: 'some output' };
      const msg: WorkerMessage = { type: 'stream-event', taskId: 'task-123', data: streamEvent as never };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'some output', undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // Result handling
  // ---------------------------------------------------------------------------

  describe('result handling', () => {
    it('maps completed outcome to exit code 0', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'completed' });
      const msg: WorkerMessage = { type: 'result', taskId: 'task-123', data: result, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 0, 'task-execution', 'proj-456');
      expect(bridge.isActive).toBe(false);
    });

    it('maps max_steps outcome to exit code 0', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'max_steps' });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(exitHandler).toHaveBeenCalledWith('task-123', 0, 'task-execution', undefined);
    });

    it('maps error outcome to exit code 1', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.on('error', vi.fn()); // Prevent unhandled error throw
      bridge.on('log', vi.fn());
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'error', error: { message: 'boom', code: 'unknown', retryable: false } });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(exitHandler).toHaveBeenCalledWith('task-123', 1, 'task-execution', undefined);
    });

    it('emits error event when result has an error', () => {
      const errorHandler = vi.fn();
      bridge.on('error', errorHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'error', error: { message: 'boom', code: 'unknown', retryable: false } });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(errorHandler).toHaveBeenCalledWith('task-123', 'boom', undefined);
    });

    it('logs summary before exit', () => {
      const logHandler = vi.fn();
      bridge.on('log', logHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult();
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(logHandler).toHaveBeenCalledWith(
        'task-123',
        expect.stringContaining('Session complete'),
        undefined,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Worker crash handling
  // ---------------------------------------------------------------------------

  describe('crash handling', () => {
    it('cancels an active Codex backend before cleaning up a worker crash', async () => {
      mockCodexRun.mockReturnValue(new Promise(() => undefined));
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'account-codex';
      bridge.on('error', vi.fn());
      bridge.spawn(config);
      const worker = getWorker();
      worker.emit('message', {
        type: 'codex-execute', requestId: 'request-1',
        data: { phase: 'coding', systemPrompt: 'test', input: 'hello' },
      } satisfies WorkerMessage);

      worker.emit('error', new Error('Worker crashed'));

      await vi.waitFor(() => expect(mockCodexCancel).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(bridge.isActive).toBe(false));
    });

    it('emits error and cleans up on worker error event', async () => {
      const errorHandler = vi.fn();
      bridge.on('error', errorHandler);
      bridge.spawn(createConfig());

      getWorker().emit('error', new Error('Worker crashed'));

      await vi.waitFor(() => expect(errorHandler).toHaveBeenCalledWith(
        'task-123', 'Worker crashed', 'proj-456',
      ));
      expect(bridge.isActive).toBe(false);
    });

    it('emits exit on worker exit event (non-zero code)', async () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      getWorker().emit('exit', 1);

      await vi.waitFor(() => expect(exitHandler).toHaveBeenCalledWith(
        'task-123', 1, 'task-execution', 'proj-456',
      ));
      expect(bridge.isActive).toBe(false);
    });

    it('does not emit exit if worker reference already cleaned up (result already handled)', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      // Simulate result handling first (which cleans up)
      const worker = getWorker();
      const result = createSessionResult();
      worker.emit('message', { type: 'result', taskId: 'task-123', data: result });
      exitHandler.mockClear();

      // Then worker exits - should not double-emit
      worker.emit('exit', 0);
      expect(exitHandler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Termination
  // ---------------------------------------------------------------------------

  describe('terminate', () => {
    it('posts abort message and terminates worker', async () => {
      bridge.spawn(createConfig());
      const worker = getWorker();

      await bridge.terminate();

      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'abort' });
      expect(worker.terminate).toHaveBeenCalled();
      expect(bridge.isActive).toBe(false);
    });

    it('handles termination when no worker is active', async () => {
      await expect(bridge.terminate()).resolves.toBeUndefined();
    });

    it('handles postMessage failure on dead worker', async () => {
      bridge.spawn(createConfig());
      getWorker().postMessage.mockImplementation(() => {
        throw new Error('Worker already dead');
      });

      await expect(bridge.terminate()).resolves.toBeUndefined();
    });

    it('cancels a main-process Codex execution cooperatively', async () => {
      mockCodexRun.mockReturnValue(new Promise(() => undefined));
      const config = createConfig();
      config.session.executionBackend = 'codex-app-server';
      config.session.accountId = 'account-codex';
      bridge.spawn(config);
      getWorker().emit('message', {
        type: 'codex-execute',
        requestId: 'request-1',
        data: {
          systemPrompt: 'test', input: 'hello', phase: 'coding',
        },
      } satisfies WorkerMessage);

      await bridge.terminate();

      expect(mockCodexCancel).toHaveBeenCalledTimes(1);
      expect(bridge.isActive).toBe(false);
    });
  });
});
