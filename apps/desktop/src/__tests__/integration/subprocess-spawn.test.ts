/**
 * Integration tests for WorkerBridge-based agent spawning
 * Tests AgentManager spawning worker threads correctly via WorkerBridge
 *
 * The project has migrated from Python subprocess spawning to TypeScript
 * worker threads. This test file verifies the new WorkerBridge path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { AgentExecutorConfig } from '../../main/ai/agent/types';

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

const createdChildren: MockChildProcess[] = [];

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const child = new MockChildProcess();
      createdChildren.push(child);
      return child;
    }),
  };
});

// =============================================================================
// Mock WorkerBridge
// =============================================================================

class MockBridge extends EventEmitter {
  spawn = vi.fn();
  terminate = vi.fn().mockResolvedValue(undefined);
  isRunning = vi.fn().mockReturnValue(false);
  workerInstance = null as null | { terminate: () => Promise<void> };
  get isActive() {
    return this.workerInstance !== null;
  }
}

// Track created bridge instances so tests can interact with them
const createdBridges: MockBridge[] = [];

vi.mock('../../main/ai/agent/worker-bridge', () => {
  class MockWorkerBridgeClass extends MockBridge {
    constructor() {
      super();
      createdBridges.push(this);
    }
  }
  return {
    WorkerBridge: MockWorkerBridgeClass,
  };
});

// =============================================================================
// Mock electron
// =============================================================================

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app/path'),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

// =============================================================================
// Mock auth / model / provider helpers
// =============================================================================

vi.mock('../../main/ai/auth/resolver', () => ({
  resolveAuth: vi.fn().mockResolvedValue({ apiKey: 'mock-api-key', baseURL: undefined }),
  resolveAuthFromQueue: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../main/ai/config/phase-config', () => ({
  resolveModelId: vi.fn((model: string) => `claude-${model}-20241022`),
}));

vi.mock('../../main/ai/providers/factory', () => ({
  detectProviderFromModel: vi.fn(() => 'anthropic'),
}));

// =============================================================================
// Mock worktree helpers
// =============================================================================

vi.mock('../../main/ai/worktree', () => ({
  createOrGetWorktree: vi.fn().mockResolvedValue({ worktreePath: null }),
}));

vi.mock('../../main/worktree-paths', () => ({
  findTaskWorktree: vi.fn().mockReturnValue(null),
}));

// =============================================================================
// Mock project store (no projects = fast path)
// =============================================================================

vi.mock('../../main/project-store', () => ({
  projectStore: {
    getProjects: vi.fn(() => []),
  },
}));

// =============================================================================
// Mock claude-profile-manager
// =============================================================================

const mockProfile = {
  id: 'default',
  name: 'Default',
  isDefault: true,
  oauthToken: 'mock-encrypted-token',
  configDir: undefined,
};

const mockProfileManager = {
  hasValidAuth: vi.fn(() => true),
  getActiveProfile: vi.fn(() => mockProfile),
  getProfile: vi.fn((_id: string) => mockProfile),
  getActiveProfileToken: vi.fn(() => 'mock-decrypted-token'),
  getProfileToken: vi.fn((_id: string) => 'mock-decrypted-token'),
  getActiveProfileEnv: vi.fn(() => ({})),
  getProfileEnv: vi.fn((_id: string) => ({})),
  setActiveProfile: vi.fn(),
  getAutoSwitchSettings: vi.fn(() => ({ enabled: false, autoSwitchOnRateLimit: false, proactiveSwapEnabled: false, autoSwitchOnAuthFailure: false })),
  getBestAvailableProfile: vi.fn(() => null),
};

vi.mock('../../main/claude-profile-manager', () => ({
  getClaudeProfileManager: vi.fn(() => mockProfileManager),
  initializeClaudeProfileManager: vi.fn(() => Promise.resolve(mockProfileManager)),
}));

// =============================================================================
// Mock OperationRegistry
// =============================================================================

vi.mock('../../main/claude-profile/operation-registry', () => ({
  getOperationRegistry: vi.fn(() => ({
    registerOperation: vi.fn(),
    unregisterOperation: vi.fn(),
  })),
}));

// =============================================================================
// Mock misc dependencies
// =============================================================================

vi.mock('../../main/ipc-handlers/task/plan-file-utils', () => ({
  resetStuckSubtasks: vi.fn().mockResolvedValue({ success: true, resetCount: 0 }),
}));

vi.mock('../../main/rate-limit-detector', () => ({
  getBestAvailableProfileEnv: vi.fn(() => ({ env: {}, profileId: 'default', profileName: 'Default', wasSwapped: false })),
  getProfileEnv: vi.fn(() => ({})),
  detectRateLimit: vi.fn(() => ({ isRateLimited: false })),
  detectAuthFailure: vi.fn(() => ({ isAuthFailure: false })),
}));

vi.mock('../../main/services/profile', () => ({
  getAPIProfileEnv: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../main/env-utils', () => ({
  getAugmentedEnv: vi.fn(() => ({})),
}));

vi.mock('../../main/platform', () => ({
  isWindows: vi.fn(() => false),
  isMacOS: vi.fn(() => false),
  isLinux: vi.fn(() => true),
  getPathDelimiter: vi.fn(() => ':'),
  killProcessGracefully: vi.fn(),
  findExecutable: vi.fn(() => null),
}));

vi.mock('../../main/cli-tool-manager', () => ({
  getToolInfo: vi.fn(() => ({ found: false, path: null, source: null })),
  getClaudeCliPathForSdk: vi.fn(() => null),
}));

vi.mock('../../main/settings-utils', () => ({
  readSettingsFile: vi.fn(() => ({})),
}));

vi.mock('../../main/agent/env-utils', () => ({
  getOAuthModeClearVars: vi.fn(() => ({})),
  normalizeEnvPathKey: vi.fn((k: string) => k),
  mergePythonEnvPath: vi.fn(),
}));

// =============================================================================
// Tests
// =============================================================================

describe('WorkerBridge Spawn Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear bridge tracking array
    createdBridges.length = 0;
    createdChildren.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
    createdBridges.length = 0;
    createdChildren.length = 0;
  });

  describe('AgentManager', () => {
    it('should create a WorkerBridge for spec creation', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();

      const promise = manager.startSpecCreation('task-1', '/project', 'Test task description');

      // Resolve the promise — bridge.spawn() is called synchronously inside spawnWorkerProcess
      await promise;

      expect(createdBridges).toHaveLength(1);
      const bridge = createdBridges[0];
      expect(bridge.spawn).toHaveBeenCalledTimes(1);

      // Verify the executor config passed to bridge.spawn
      const config: AgentExecutorConfig = bridge.spawn.mock.calls[0][0];
      expect(config.taskId).toBe('task-1');
      expect(config.processType).toBe('spec-creation');
      expect(config.session.agentType).toBe('spec_orchestrator');
      expect(config.session.toolContext.cwd).toBe('/project');
      expect(config.session.toolContext.allowedWritePaths).toEqual([
        '/project/.auto-claude/specs/task-1',
      ]);
    }, 15000);

    it('should create a WorkerBridge for task execution', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();

      await manager.startTaskExecution('task-1', '/project', 'spec-001');

      expect(createdBridges).toHaveLength(1);
      const bridge = createdBridges[0];
      expect(bridge.spawn).toHaveBeenCalledTimes(1);

      const config: AgentExecutorConfig = bridge.spawn.mock.calls[0][0];
      expect(config.taskId).toBe('task-1');
      expect(config.processType).toBe('task-execution');
      expect(config.session.agentType).toBe('build_orchestrator');
      expect(config.session.toolContext.allowedWritePaths).toEqual(['/project']);
    }, 15000);

    it('should not spawn a Codex task when worktree creation fails', async () => {
      const { AgentManager } = await import('../../main/agent');
      const { readSettingsFile } = await import('../../main/settings-utils');
      const { resolveAuthFromQueue } = await import('../../main/ai/auth/resolver');
      const { createOrGetWorktree } = await import('../../main/ai/worktree');
      vi.mocked(readSettingsFile).mockReturnValue({
        providerAccounts: [{ id: 'codex-1', provider: 'openai' }],
        globalPriorityOrder: ['codex-1'],
      } as never);
      vi.mocked(resolveAuthFromQueue).mockResolvedValueOnce({
        accountId: 'codex-1', resolvedProvider: 'openai',
        resolvedModelId: 'gpt-5.3-codex', executionBackend: 'codex-app-server',
      } as never);
      vi.mocked(createOrGetWorktree).mockRejectedValueOnce(new Error('worktree failed'));
      const manager = new AgentManager();
      const error = vi.fn();
      manager.on('error', error);

      await manager.startTaskExecution('task-codex', '/project', 'spec-001');

      expect(createdBridges).toHaveLength(0);
      expect(error).toHaveBeenCalledWith(
        'task-codex',
        'Codex subscription tasks require an isolated worktree. Task was not started.',
      );
    }, 15000);

    it('should not spawn Codex QA without the task worktree', async () => {
      const { AgentManager } = await import('../../main/agent');
      const { readSettingsFile } = await import('../../main/settings-utils');
      const { resolveAuthFromQueue } = await import('../../main/ai/auth/resolver');
      vi.mocked(readSettingsFile).mockReturnValue({
        providerAccounts: [{ id: 'codex-1', provider: 'openai' }],
        globalPriorityOrder: ['codex-1'],
      } as never);
      vi.mocked(resolveAuthFromQueue).mockResolvedValueOnce({
        accountId: 'codex-1', resolvedProvider: 'openai',
        resolvedModelId: 'gpt-5.3-codex', executionBackend: 'codex-app-server',
      } as never);
      const manager = new AgentManager();
      const error = vi.fn();
      manager.on('error', error);

      await manager.startQAProcess('task-codex-qa', '/project', 'spec-001');

      expect(createdBridges).toHaveLength(0);
      expect(error).toHaveBeenCalledWith(
        'task-codex-qa',
        'Codex subscription QA requires the task worktree. QA was not started.',
      );
    }, 15000);

    it('should create a WorkerBridge for QA process', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();

      await manager.startQAProcess('task-1', '/project', 'spec-001');

      expect(createdBridges).toHaveLength(1);
      const bridge = createdBridges[0];
      expect(bridge.spawn).toHaveBeenCalledTimes(1);

      const config: AgentExecutorConfig = bridge.spawn.mock.calls[0][0];
      expect(config.taskId).toBe('task-1');
      expect(config.processType).toBe('qa-process');
      expect(config.session.agentType).toBe('qa_reviewer');
      expect(config.session.toolContext.allowedWritePaths).toEqual(['/project']);
    }, 15000);

    it('should accept parallel options without affecting process type', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();

      await manager.startTaskExecution('task-1', '/project', 'spec-001', {
        parallel: true,
        workers: 4,
      });

      expect(createdBridges).toHaveLength(1);
      const bridge = createdBridges[0];
      const config: AgentExecutorConfig = bridge.spawn.mock.calls[0][0];
      expect(config.processType).toBe('task-execution');
    }, 15000);

    it('should emit log events forwarded from the bridge', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      const logHandler = vi.fn();
      manager.on('log', logHandler);

      await manager.startSpecCreation('task-1', '/project', 'Test');

      // Simulate bridge emitting a log event
      const bridge = createdBridges[0];
      bridge.emit('log', 'task-1', 'Test log output\n', undefined);

      expect(logHandler).toHaveBeenCalledWith('task-1', 'Test log output\n', undefined);
    }, 15000);

    it('should emit error events forwarded from the bridge', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await manager.startSpecCreation('task-1', '/project', 'Test');

      const bridge = createdBridges[0];
      bridge.emit('error', 'task-1', 'Something went wrong', undefined);

      expect(errorHandler).toHaveBeenCalledWith('task-1', 'Something went wrong', undefined);
    }, 15000);

    it('should emit exit events forwarded from the bridge', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      const exitHandler = vi.fn();
      manager.on('exit', exitHandler);

      await manager.startSpecCreation('task-1', '/project', 'Test');

      const bridge = createdBridges[0];
      bridge.emit('exit', 'task-1', 0, 'spec-creation', undefined);

      expect(exitHandler).toHaveBeenCalledWith('task-1', 0, 'spec-creation', undefined);
    }, 15000);

    it('should forward current bridge progress and task events', async () => {
      const { AgentManager } = await import('../../main/agent');
      const manager = new AgentManager();
      const progress = vi.fn();
      const taskEvent = vi.fn();
      manager.on('execution-progress', progress);
      manager.on('task-event', taskEvent);
      await manager.startSpecCreation('task-1', '/project', 'Test');
      progress.mockClear();

      const bridge = createdBridges[0];
      bridge.emit('execution-progress', 'task-1', {
        phase: 'coding', phaseProgress: 75, overallProgress: 75,
      });
      bridge.emit('task-event', 'task-1', { type: 'current' });

      expect(progress).toHaveBeenCalledOnce();
      expect(taskEvent).toHaveBeenCalledOnce();
    }, 15000);

    it('should report task as running after spawn', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      await manager.startSpecCreation('task-1', '/project', 'Test');

      expect(manager.isRunning('task-1')).toBe(true);
    }, 15000);

    it('should kill task and remove from tracking', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      await manager.startSpecCreation('task-1', '/project', 'Test');

      expect(manager.isRunning('task-1')).toBe(true);

      const result = await manager.killTask('task-1');

      expect(result).toBe(true);
      expect(manager.isRunning('task-1')).toBe(false);
      expect(createdBridges[0].eventNames()).toEqual([]);
    }, 15000);

    it('should return false when killing non-existent task', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      const result = await manager.killTask('nonexistent');

      expect(result).toBe(false);
    }, 15000);

    it('should track running tasks', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      expect(manager.getRunningTasks()).toHaveLength(0);

      await manager.startSpecCreation('task-1', '/project', 'Test 1');
      await manager.startTaskExecution('task-2', '/project', 'spec-001');

      expect(manager.getRunningTasks()).toHaveLength(2);
      expect(manager.getRunningTasks()).toContain('task-1');
      expect(manager.getRunningTasks()).toContain('task-2');
    }, 15000);

    it('should kill all running tasks', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      await manager.startSpecCreation('task-1', '/project', 'Test 1');
      await manager.startTaskExecution('task-2', '/project', 'spec-001');

      expect(manager.getRunningTasks()).toHaveLength(2);

      await manager.killAll();

      expect(manager.getRunningTasks()).toHaveLength(0);
    }, 15000);

    it('should allow sequential execution of same task', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();

      await manager.startSpecCreation('task-1', '/project', 'Test 1');
      expect(manager.isRunning('task-1')).toBe(true);

      // Kill the first run
      await manager.killTask('task-1');
      expect(manager.isRunning('task-1')).toBe(false);

      // Start again
      await manager.startSpecCreation('task-1', '/project', 'Test 2');
      expect(manager.isRunning('task-1')).toBe(true);
    }, 15000);

    it('should include projectId in executor config when provided', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      await manager.startSpecCreation('task-1', '/project', 'Test task', undefined, undefined, undefined, 'project-42');

      const bridge = createdBridges[0];
      const config: AgentExecutorConfig = bridge.spawn.mock.calls[0][0];
      expect(config.projectId).toBe('project-42');
    }, 15000);

    it('drops delayed callbacks from a replaced bridge and keeps the new owner', async () => {
      const { AgentManager } = await import('../../main/agent');
      const manager = new AgentManager();
      const progress = vi.fn();
      const error = vi.fn();
      const taskEvent = vi.fn();
      const exit = vi.fn();
      manager.on('execution-progress', progress);
      manager.on('error', error);
      manager.on('task-event', taskEvent);
      manager.on('exit', exit);

      await manager.startSpecCreation('task-1', '/project', 'Old');
      const oldBridge = createdBridges[0];
      const state = (manager as unknown as {
        state: { addProcess: (taskId: string, process: object) => void; getProcess: (taskId: string) => unknown };
      }).state;
      const newerOwner = {
        taskId: 'task-1', process: null, worker: null,
        workerBridge: { terminate: vi.fn().mockResolvedValue(undefined) },
        startedAt: new Date(), spawnId: 999,
      };
      state.addProcess('task-1', newerOwner);
      progress.mockClear();

      oldBridge.emit('execution-progress', 'task-1', {
        phase: 'coding', phaseProgress: 50, overallProgress: 50,
      });
      oldBridge.emit('error', 'task-1', 'stale error');
      oldBridge.emit('task-event', 'task-1', { type: 'stale' });
      oldBridge.emit('exit', 'task-1', 1, 'spec-creation');

      expect(progress).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(taskEvent).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(manager.isRunning('task-1')).toBe(true);
      expect(state.getProcess('task-1')).toBe(newerOwner);
      expect(oldBridge.eventNames()).toEqual([]);
    }, 15000);

    it('keeps a newer owner when an old bridge exits during awaited cancellation', async () => {
      const { AgentManager } = await import('../../main/agent');
      const manager = new AgentManager();
      const exit = vi.fn();
      manager.on('exit', exit);
      await manager.startSpecCreation('task-1', '/project', 'Old');
      const oldBridge = createdBridges[0];
      let settle!: () => void;
      oldBridge.terminate = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));

      const killing = manager.killTask('task-1');
      await Promise.resolve();
      const state = (manager as unknown as {
        state: { addProcess: (taskId: string, process: object) => void; getProcess: (taskId: string) => unknown };
      }).state;
      const newerOwner = {
        taskId: 'task-1', process: null, worker: null,
        workerBridge: { terminate: vi.fn().mockResolvedValue(undefined) },
        startedAt: new Date(), spawnId: 999,
      };
      state.addProcess('task-1', newerOwner);

      oldBridge.emit('exit', 'task-1', 0, 'spec-creation');
      expect(exit).not.toHaveBeenCalled();
      expect(state.getProcess('task-1')).toBe(newerOwner);
      settle();
      await expect(killing).resolves.toBe(true);
      expect(state.getProcess('task-1')).toBe(newerOwner);
      expect(oldBridge.eventNames()).toEqual([]);
    }, 15000);

    it('drops delayed child output, errors, and exit after child replacement', async () => {
      const { AgentManager } = await import('../../main/agent');
      const manager = new AgentManager();
      const log = vi.fn();
      const error = vi.fn();
      const taskEvent = vi.fn();
      const exit = vi.fn();
      manager.on('log', log);
      manager.on('error', error);
      manager.on('task-event', taskEvent);
      manager.on('exit', exit);
      const processManager = (manager as unknown as {
        processManager: { spawnProcess: (...args: unknown[]) => Promise<void> };
      }).processManager;

      await processManager.spawnProcess('task-child', '/project', ['old'], {}, 'task-execution');
      const oldChild = createdChildren[0];
      const state = (manager as unknown as {
        state: { addProcess: (taskId: string, process: object) => void; getProcess: (taskId: string) => unknown };
      }).state;
      const newerChild = new MockChildProcess();
      const newerOwner = {
        taskId: 'task-child', process: newerChild, worker: null, workerBridge: null,
        startedAt: new Date(), spawnId: 999,
      };
      state.addProcess('task-child', newerOwner);
      log.mockClear();

      const payload = JSON.stringify({
        type: 'status', taskId: 'task-child', specId: 'spec-1', projectId: 'project-1',
        timestamp: new Date().toISOString(), eventId: 'event-1', sequence: 1,
      });
      oldChild.stdout.emit('data', Buffer.from(`__TASK_EVENT__:${payload}\n`));
      oldChild.stderr.emit('data', Buffer.from('stale stderr\n'));
      oldChild.emit('error', new Error('stale child error'));
      oldChild.emit('exit', 1);

      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(taskEvent).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(manager.isRunning('task-child')).toBe(true);
      expect(state.getProcess('task-child')).toBe(newerOwner);
      expect(oldChild.eventNames()).toEqual([]);
      expect(oldChild.stdout.eventNames()).toEqual([]);
      expect(oldChild.stderr.eventNames()).toEqual([]);

      await processManager.spawnProcess('task-child', '/project', ['new'], {}, 'task-execution');
      const newChild = createdChildren[1];
      newChild.stdout.emit('data', Buffer.from(`__TASK_EVENT__:${payload}\n`));
      expect(log).toHaveBeenCalledOnce();
      expect(taskEvent).toHaveBeenCalledOnce();
      newChild.emit('exit', 0);
      expect(exit).toHaveBeenCalledOnce();
      expect(manager.isRunning('task-child')).toBe(false);
    }, 15000);

    it('keeps a newer child owner when the old child exits late', async () => {
      const { AgentManager } = await import('../../main/agent');
      const manager = new AgentManager();
      const exit = vi.fn();
      manager.on('exit', exit);
      const processManager = (manager as unknown as {
        processManager: { spawnProcess: (...args: unknown[]) => Promise<void> };
      }).processManager;
      const state = (manager as unknown as {
        state: { addProcess: (taskId: string, process: object) => void; getProcess: (taskId: string) => unknown };
      }).state;

      await processManager.spawnProcess('task-child', '/project', ['old'], {}, 'task-execution');
      const oldChild = createdChildren[0];
      const newerOwner = {
        taskId: 'task-child', process: new MockChildProcess(), worker: null, workerBridge: null,
        startedAt: new Date(), spawnId: 999,
      };
      state.addProcess('task-child', newerOwner);

      oldChild.emit('exit', 1);

      expect(exit).not.toHaveBeenCalled();
      expect(state.getProcess('task-child')).toBe(newerOwner);
      expect(oldChild.eventNames()).toEqual([]);
      expect(oldChild.stdout.eventNames()).toEqual([]);
      expect(oldChild.stderr.eventNames()).toEqual([]);
    }, 15000);
  });
});
