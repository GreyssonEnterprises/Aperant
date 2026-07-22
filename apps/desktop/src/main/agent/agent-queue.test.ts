import { EventEmitter } from 'node:events';
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
  beforeEach(() => vi.clearAllMocks());

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

  it('awaits legacy ideation kill before emitting stopped', async () => {
    const h = harness('ideation');
    const stopped = vi.fn();
    h.emitter.on('ideation-stopped', stopped);
    const stopping = h.queue.stopIdeation('project-1');
    await Promise.resolve();
    expect(stopped).not.toHaveBeenCalled();
    h.pending.resolve(true);
    await expect(stopping).resolves.toBe(true);
    expect(stopped).toHaveBeenCalledWith('project-1');
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
});
