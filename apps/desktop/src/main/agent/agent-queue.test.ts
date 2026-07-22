import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ai/runners/ideation', () => ({
  IDEATION_TYPES: ['feature'],
  runIdeation: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../ai/runners/roadmap', () => ({
  runRoadmapGeneration: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../ai/prompts/prompt-loader', () => ({
  resolvePromptsDir: vi.fn(() => '/prompts'),
}));

import { runIdeation } from '../ai/runners/ideation';
import { runRoadmapGeneration } from '../ai/runners/roadmap';
import { AgentEvents } from './agent-events';
import { AgentQueueManager } from './agent-queue';
import type { AgentProcessManager } from './agent-process';
import { AgentState } from './agent-state';

function deferredBoolean() {
  let resolve!: (value: boolean) => void;
  return {
    promise: new Promise<boolean>((done) => { resolve = done; }),
    resolve,
  };
}

function deferredResult() {
  let resolve!: (value: { success: boolean }) => void;
  return {
    promise: new Promise<{ success: boolean }>((done) => { resolve = done; }),
    resolve,
  };
}

function harness(queueProcessType: 'ideation' | 'roadmap') {
  const state = new AgentState();
  const emitter = new EventEmitter();
  const pending = deferredBoolean();
  const killProcess = vi.fn(() => pending.promise);
  const processManager = { killProcess } as unknown as AgentProcessManager;
  const queue = new AgentQueueManager(state, new AgentEvents(), processManager, emitter);
  state.addProcess('project-1', {
    taskId: 'project-1', process: null, worker: null, startedAt: new Date(), spawnId: 1,
    queueProcessType,
  });
  return { state, emitter, pending, killProcess, queue };
}

describe('AgentQueueManager awaited process replacement and stop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIdeation).mockReset().mockResolvedValue({ success: true } as never);
    vi.mocked(runRoadmapGeneration).mockReset().mockResolvedValue({ success: true } as never);
  });

  it('awaits ideation replacement kill before starting a new runner', async () => {
    const h = harness('ideation');
    const starting = h.queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await Promise.resolve();
    expect(runIdeation).not.toHaveBeenCalled();
    h.pending.resolve(true);
    await starting;
    expect(h.killProcess).toHaveBeenCalledWith('project-1');
    expect(runIdeation).toHaveBeenCalledOnce();
  });

  it('emits an error instead of an empty completion when every ideation type fails', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn().mockResolvedValue(true) } as unknown as AgentProcessManager,
      emitter,
    );
    vi.mocked(runIdeation).mockResolvedValue({
      success: false,
      text: '',
      error: 'Codex subscription backend unavailable',
    });
    const failed = vi.fn();
    const completed = vi.fn();
    emitter.on('ideation-error', failed);
    emitter.on('ideation-complete', completed);

    await queue.startIdeationGeneration(
      'project-1',
      '/project',
      { enabledTypes: ['feature'] } as never,
    );

    expect(failed).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Codex subscription backend unavailable'),
    );
    expect(completed).not.toHaveBeenCalled();
  });

  it('aggregates category output into a persisted ideation session', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aperant-ideation-'));
    const outputDir = join(projectPath, '.auto-claude', 'ideation');
    const state = new AgentState();
    const emitter = new EventEmitter();
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn().mockResolvedValue(true) } as unknown as AgentProcessManager,
      emitter,
    );
    vi.mocked(runIdeation).mockImplementation(async () => {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'feature_ideas.json'), JSON.stringify({
        feature: [{
          id: 'ci-001',
          type: 'code_improvements',
          title: 'Typed IPC errors',
          description: 'Preserve backend failures.',
          rationale: 'The event system already supports errors.',
        }],
      }));
      return { success: true, text: '' } as never;
    });
    const completed = vi.fn();
    emitter.on('ideation-complete', completed);

    try {
      await queue.startIdeationGeneration(
        'project-1',
        projectPath,
        { enabledTypes: ['feature'] } as never,
      );

      expect(completed).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ ideas: [expect.objectContaining({ id: 'ci-001' })] }),
      );
      expect(JSON.parse(readFileSync(join(outputDir, 'ideation.json'), 'utf8')).ideas)
        .toHaveLength(1);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('does not accept a stale category file when the current run writes nothing', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aperant-ideation-stale-'));
    const outputDir = join(projectPath, '.auto-claude', 'ideation');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'feature_ideas.json'), JSON.stringify({
      feature: [{
        id: 'stale-001',
        type: 'code_improvements',
        title: 'Stale idea',
        description: 'This came from an earlier run.',
        rationale: 'It must not be reused.',
      }],
    }));
    const state = new AgentState();
    const emitter = new EventEmitter();
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn().mockResolvedValue(true) } as unknown as AgentProcessManager,
      emitter,
    );
    vi.mocked(runIdeation).mockResolvedValue({ success: true, text: '' } as never);
    const failed = vi.fn();
    const completed = vi.fn();
    emitter.on('ideation-error', failed);
    emitter.on('ideation-complete', completed);

    try {
      await queue.startIdeationGeneration(
        'project-1',
        projectPath,
        { enabledTypes: ['feature'] } as never,
      );

      expect(failed).toHaveBeenCalledWith(
        'project-1',
        expect.stringContaining('did not produce a valid category output file'),
      );
      expect(completed).not.toHaveBeenCalled();
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('awaits roadmap replacement kill before starting a new runner', async () => {
    const h = harness('roadmap');
    const starting = h.queue.startRoadmapGeneration('project-1', '/project');
    await Promise.resolve();
    expect(runRoadmapGeneration).not.toHaveBeenCalled();
    h.pending.resolve(true);
    await starting;
    expect(h.killProcess).toHaveBeenCalledWith('project-1');
    expect(runRoadmapGeneration).toHaveBeenCalledOnce();
  });

  it('awaits legacy ideation kill without emitting renderer-owned stopped', async () => {
    const h = harness('ideation');
    const stopped = vi.fn();
    h.emitter.on('ideation-stopped', stopped);
    const stopping = h.queue.stopIdeation('project-1');
    await Promise.resolve();
    expect(stopped).not.toHaveBeenCalled();
    h.pending.resolve(true);
    await expect(stopping).resolves.toBe(true);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('does not emit roadmap stopped when legacy kill is unsafe', async () => {
    const h = harness('roadmap');
    const stopped = vi.fn();
    h.emitter.on('roadmap-stopped', stopped);
    const stopping = h.queue.stopRoadmap('project-1');
    await Promise.resolve();
    expect(stopped).not.toHaveBeenCalled();
    h.pending.resolve(false);
    await expect(stopping).resolves.toBe(false);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('keeps a replacement ideation run tracked when the aborted old run completes later', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const first = deferredResult();
    const second = deferredResult();
    vi.mocked(runIdeation)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);
    const killProcess = vi.fn(async (projectId: string) => {
      state.deleteProcess(projectId);
      return true;
    });
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess } as unknown as AgentProcessManager,
      emitter,
    );

    const oldRun = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledTimes(1));
    const newRun = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await Promise.resolve();
    expect(runIdeation).toHaveBeenCalledOnce();
    first.resolve({ success: true });
    await oldRun;
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledTimes(2));

    expect(queue.isIdeationRunning('project-1')).toBe(true);
    const stop = queue.stopIdeation('project-1');
    second.resolve({ success: true });
    await expect(stop).resolves.toBe(true);
    await newRun;
    expect(queue.isIdeationRunning('project-1')).toBe(false);
  });

  it('keeps a replacement roadmap run tracked when the aborted old run completes later', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const first = deferredResult();
    const second = deferredResult();
    vi.mocked(runRoadmapGeneration)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);
    const killProcess = vi.fn(async (projectId: string) => {
      state.deleteProcess(projectId);
      return true;
    });
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess } as unknown as AgentProcessManager,
      emitter,
    );

    const oldRun = queue.startRoadmapGeneration('project-1', '/project');
    await vi.waitFor(() => expect(runRoadmapGeneration).toHaveBeenCalledTimes(1));
    const newRun = queue.startRoadmapGeneration('project-1', '/project');
    await Promise.resolve();
    expect(runRoadmapGeneration).toHaveBeenCalledOnce();
    first.resolve({ success: true });
    await oldRun;
    await vi.waitFor(() => expect(runRoadmapGeneration).toHaveBeenCalledTimes(2));

    expect(queue.isRoadmapRunning('project-1')).toBe(true);
    const stop = queue.stopRoadmap('project-1');
    second.resolve({ success: true });
    await expect(stop).resolves.toBe(true);
    await newRun;
    expect(queue.isRoadmapRunning('project-1')).toBe(false);
  });

  it('awaits an in-flight ideation runner before installing a roadmap owner', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const ideation = deferredResult();
    const roadmap = deferredResult();
    vi.mocked(runIdeation).mockReturnValueOnce(ideation.promise as never);
    vi.mocked(runRoadmapGeneration).mockReturnValueOnce(roadmap.promise as never);
    const killProcess = vi.fn().mockResolvedValue(true);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess } as unknown as AgentProcessManager,
      emitter,
    );

    const oldRun = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());
    const replacement = queue.startRoadmapGeneration('project-1', '/project');
    await Promise.resolve();
    expect(runRoadmapGeneration).not.toHaveBeenCalled();
    expect((vi.mocked(runIdeation).mock.calls[0]?.[0] as { abortSignal: AbortSignal })
      .abortSignal.aborted).toBe(true);
    expect(killProcess).not.toHaveBeenCalled();

    ideation.resolve({ success: true });
    await oldRun;
    await vi.waitFor(() => expect(runRoadmapGeneration).toHaveBeenCalledOnce());
    expect(state.getProcess('project-1')?.queueProcessType).toBe('roadmap');

    const stop = queue.stopRoadmap('project-1');
    roadmap.resolve({ success: true });
    await expect(stop).resolves.toBe(true);
    await replacement;
  });

  it('awaits an in-flight roadmap runner before installing an ideation owner', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const roadmap = deferredResult();
    const ideation = deferredResult();
    vi.mocked(runRoadmapGeneration).mockReturnValueOnce(roadmap.promise as never);
    vi.mocked(runIdeation).mockReturnValueOnce(ideation.promise as never);
    const killProcess = vi.fn().mockResolvedValue(true);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess } as unknown as AgentProcessManager,
      emitter,
    );

    const oldRun = queue.startRoadmapGeneration('project-1', '/project');
    await vi.waitFor(() => expect(runRoadmapGeneration).toHaveBeenCalledOnce());
    const replacement = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await Promise.resolve();
    expect(runIdeation).not.toHaveBeenCalled();
    expect((vi.mocked(runRoadmapGeneration).mock.calls[0]?.[0] as { abortSignal: AbortSignal })
      .abortSignal.aborted).toBe(true);
    expect(killProcess).not.toHaveBeenCalled();

    roadmap.resolve({ success: true });
    await oldRun;
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());
    expect(state.getProcess('project-1')?.queueProcessType).toBe('ideation');

    const stop = queue.stopIdeation('project-1');
    ideation.resolve({ success: true });
    await expect(stop).resolves.toBe(true);
    await replacement;
  });

  it('does not resolve stop or emit STOPPED until the tracked runner settles', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const ideation = deferredResult();
    vi.mocked(runIdeation).mockReturnValueOnce(ideation.promise as never);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn().mockResolvedValue(true) } as unknown as AgentProcessManager,
      emitter,
    );
    const stopped = vi.fn();
    emitter.on('ideation-stopped', stopped);
    const running = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());

    let stopSettled = false;
    const stop = queue.stopIdeation('project-1').then((result) => {
      stopSettled = true;
      return result;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    expect(stopped).not.toHaveBeenCalled();

    ideation.resolve({ success: true });
    await running;
    await expect(stop).resolves.toBe(true);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('returns failure and never emits STOPPED when tracked runner cleanup rejects', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn().mockResolvedValue(true) } as unknown as AgentProcessManager,
      emitter,
    );
    const stopped = vi.fn();
    const failed = vi.fn();
    emitter.on('ideation-stopped', stopped);
    emitter.on('ideation-error', failed);
    const config = {} as Record<string, unknown>;
    Object.defineProperty(config, 'enabledTypes', {
      get: () => { throw new Error('runner cleanup failed'); },
    });

    const running = queue.startIdeationGeneration('project-1', '/project', config as never);
    const stop = queue.stopIdeation('project-1');

    await expect(stop).resolves.toBe(false);
    await expect(running).rejects.toThrow('runner cleanup failed');
    expect(stopped).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('queues stop behind a pending start and stops the runner that start installs', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const legacyKill = deferredBoolean();
    const runner = deferredResult();
    vi.mocked(runIdeation).mockReturnValueOnce(runner.promise as never);
    const killProcess = vi.fn(() => legacyKill.promise);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess } as unknown as AgentProcessManager,
      emitter,
    );
    state.addProcess('project-1', {
      taskId: 'project-1', process: null, worker: null, startedAt: new Date(), spawnId: 1,
      queueProcessType: 'ideation',
    });

    const start = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    let stopSettled = false;
    const stop = queue.stopIdeation('project-1').then((result) => {
      stopSettled = true;
      return result;
    });
    legacyKill.resolve(true);
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());
    expect(stopSettled).toBe(false);

    runner.resolve({ success: true });
    await expect(stop).resolves.toBe(true);
    await start;
    expect(queue.isIdeationRunning('project-1')).toBe(false);
  });

  it('queues a cross-kind stop behind pending start before returning kind mismatch', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const legacyKill = deferredBoolean();
    const runner = deferredResult();
    vi.mocked(runIdeation).mockReturnValueOnce(runner.promise as never);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn(() => legacyKill.promise) } as unknown as AgentProcessManager,
      emitter,
    );
    state.addProcess('project-1', {
      taskId: 'project-1', process: null, worker: null, startedAt: new Date(), spawnId: 1,
      queueProcessType: 'ideation',
    });

    const start = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    let stopSettled = false;
    const stop = queue.stopRoadmap('project-1').then((result) => {
      stopSettled = true;
      return result;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    legacyKill.resolve(true);
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());
    await expect(stop).resolves.toBe(false);
    expect(queue.isIdeationRunning('project-1')).toBe(true);

    const cleanup = queue.stopIdeation('project-1');
    runner.resolve({ success: true });
    await cleanup;
    await start;
  });

  it('serializes two starts invoked while a legacy kill is pending', async () => {
    const state = new AgentState();
    const emitter = new EventEmitter();
    const legacyKill = deferredBoolean();
    const ideation = deferredResult();
    const roadmap = deferredResult();
    vi.mocked(runIdeation).mockReturnValueOnce(ideation.promise as never);
    vi.mocked(runRoadmapGeneration).mockReturnValueOnce(roadmap.promise as never);
    const queue = new AgentQueueManager(
      state,
      new AgentEvents(),
      { killProcess: vi.fn(() => legacyKill.promise) } as unknown as AgentProcessManager,
      emitter,
    );
    state.addProcess('project-1', {
      taskId: 'project-1', process: null, worker: null, startedAt: new Date(), spawnId: 1,
      queueProcessType: 'ideation',
    });

    const first = queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );
    const second = queue.startRoadmapGeneration('project-1', '/project');
    legacyKill.resolve(true);
    await vi.waitFor(() => expect(runIdeation).toHaveBeenCalledOnce());
    expect(runRoadmapGeneration).not.toHaveBeenCalled();
    ideation.resolve({ success: true });
    await first;
    await vi.waitFor(() => expect(runRoadmapGeneration).toHaveBeenCalledOnce());
    expect(state.getProcess('project-1')?.queueProcessType).toBe('roadmap');

    const stop = queue.stopRoadmap('project-1');
    roadmap.resolve({ success: true });
    await stop;
    await second;
    expect((queue as unknown as { operations: Map<string, unknown> }).operations.size).toBe(0);
  });

  it('releases the project operation entry when a start transition rejects', async () => {
    const h = harness('ideation');
    const starting = h.queue.startIdeationGeneration(
      'project-1', '/project', { enabledTypes: ['feature'] } as never,
    );

    h.pending.resolve(false);
    await expect(starting).rejects.toThrow('previous process did not stop safely');
    await vi.waitFor(() => expect(
      (h.queue as unknown as { operations: Map<string, unknown> }).operations.size,
    ).toBe(0));
  });
});
