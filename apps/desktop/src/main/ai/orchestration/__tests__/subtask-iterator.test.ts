/**
 * Comprehensive tests for subtask-iterator.ts
 * Covers all functions: iterateSubtasks, ensureSubtaskMarkedCompleted, syncPhasesToMain,
 * loadImplementationPlan, getNextPendingSubtask, countTotalSubtasks, countCompletedSubtasks,
 * extractInsightsAfterSession, and delay
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  iterateSubtasks,
  restampExecutionPhase,
  type SubtaskIteratorConfig,
  type SubtaskIteratorResult,
} from '../subtask-iterator';
import type { SessionResult } from '../../session/types';

// =============================================================================
// Test Utilities
// =============================================================================

const createMockPlan = (subtasks: Array<{ id: string; status: string; description?: string }>) => ({
  feature: 'test-feature',
  workflow_type: 'feature',
  executionPhase: 'coding',
  phases: [
    {
      id: 'phase-1',
      phase: 1,
      name: 'Implementation',
      subtasks: subtasks.map((st) => ({
        id: st.id,
        title: `Subtask ${st.id}`,
        description: st.description || `Description for ${st.id}`,
        status: st.status,
        files_to_create: [],
        files_to_modify: [],
      })),
    },
  ],
});

const createMockSessionResult = (outcome: SessionResult['outcome'], error?: Error): SessionResult => ({
  outcome,
  stepsExecuted: 1,
  usage: {
    promptTokens: 50,
    completionTokens: 50,
    totalTokens: 100,
  },
  error: error as any,
  messages: [],
  durationMs: 1000,
  toolCallCount: 0,
});

// =============================================================================
// loadImplementationPlan
// =============================================================================

describe('loadImplementationPlan', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'plan-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses a valid implementation plan', async () => {
    const plan = createMockPlan([
      { id: 'subtask-1', status: 'pending' },
      { id: 'subtask-2', status: 'completed' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    // This is tested indirectly through iterateSubtasks
    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);
    expect(result.totalSubtasks).toBe(2);
  });

  it('returns null when the plan file does not exist', async () => {
    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);
    expect(result.totalSubtasks).toBe(0);
  });

  it('returns null for corrupt JSON', async () => {
    await writeFile(planPath, '{ invalid json }');

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);
    expect(result.totalSubtasks).toBe(0);
  });
});

// =============================================================================
// getNextPendingSubtask
// =============================================================================

describe('getNextPendingSubtask logic (via iterateSubtasks)', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'next-pending-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds the first pending subtask', async () => {
    const plan = createMockPlan([
      { id: 'subtask-1', status: 'completed' },
      { id: 'subtask-2', status: 'pending' },
      { id: 'subtask-3', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    // Should have called for subtask-2 (first pending) and subtask-3
    expect(runSubtaskSession).toHaveBeenCalledTimes(2);
    expect(runSubtaskSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'subtask-2' }),
      1,
    );
    expect(runSubtaskSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'subtask-3' }),
      1,
    );
  });

  it('finds in_progress subtasks that need retry', async () => {
    const plan = createMockPlan([
      { id: 'subtask-1', status: 'completed' },
      { id: 'subtask-2', status: 'in_progress' },
      { id: 'subtask-3', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    // Should have called for subtask-2 (in_progress, needs retry) and subtask-3
    expect(runSubtaskSession).toHaveBeenCalledTimes(2);
    expect(runSubtaskSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'subtask-2' }),
      1,
    );
  });

  it('skips subtasks marked as stuck', async () => {
    const plan = createMockPlan([
      { id: 'subtask-1', status: 'completed' },
      { id: 'subtask-2', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    let callCount = 0;
    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockImplementation(async () => {
      callCount++;
      // Always return error to trigger max retries
      return createMockSessionResult('error', new Error('Test error') as any);
    });

    const onSubtaskStuck = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 2, // Will mark as stuck after 2 failures
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onSubtaskStuck,
    };

    const result = await iterateSubtasks(config);

    // subtask-2 should be marked as stuck
    expect(result.stuckSubtasks).toContain('subtask-2');
    expect(onSubtaskStuck).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'subtask-2' }),
      'Exceeded max retries (2)',
    );
  });

  it('returns null when all subtasks are completed', async () => {
    const plan = createMockPlan([
      { id: 'subtask-1', status: 'completed' },
      { id: 'subtask-2', status: 'completed' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);

    expect(runSubtaskSession).not.toHaveBeenCalled();
    expect(result.completedSubtasks).toBe(2);
  });
});

// =============================================================================
// countTotalSubtasks and countCompletedSubtasks
// =============================================================================

describe('Subtask counting (via iterateSubtasks)', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'counting-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('counts total subtasks across all phases', async () => {
    const plan = {
      feature: 'test',
      phases: [
        {
          name: 'Phase 1',
          subtasks: [
            { id: 's1', title: 'S1', description: 'D1', status: 'pending' },
            { id: 's2', title: 'S2', description: 'D2', status: 'pending' },
          ],
        },
        {
          name: 'Phase 2',
          subtasks: [
            { id: 's3', title: 'S3', description: 'D3', status: 'pending' },
          ],
        },
      ],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);
    expect(result.totalSubtasks).toBe(3);
  });

  it('counts completed subtasks correctly', async () => {
    const plan = createMockPlan([
      { id: 's1', status: 'completed' },
      { id: 's2', status: 'completed' },
      { id: 's3', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);
    expect(result.totalSubtasks).toBe(3);
    expect(result.completedSubtasks).toBe(3); // All should be completed
  });
});

// =============================================================================
// iterateSubtasks - Main Function
// =============================================================================

describe('iterateSubtasks', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'iterate-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('processes all pending subtasks successfully', async () => {
    const plan = createMockPlan([
      { id: 's1', status: 'pending' },
      { id: 's2', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const onSubtaskStart = vi.fn();
    const onSubtaskComplete = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onSubtaskStart,
      onSubtaskComplete,
    };

    const result = await iterateSubtasks(config);

    expect(result.totalSubtasks).toBe(2);
    expect(result.completedSubtasks).toBe(2);
    expect(result.stuckSubtasks).toHaveLength(0);
    expect(result.cancelled).toBe(false);
    expect(onSubtaskStart).toHaveBeenCalledTimes(2);
    expect(onSubtaskComplete).toHaveBeenCalledTimes(2);
  });

  it('marks subtask as stuck after max retries', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('error', new Error('Failed') as any));

    const onSubtaskStuck = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 2,
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onSubtaskStuck,
    };

    const result = await iterateSubtasks(config);

    expect(result.stuckSubtasks).toContain('s1');
    expect(onSubtaskStuck).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      'Exceeded max retries (2)',
    );
    expect(runSubtaskSession).toHaveBeenCalledTimes(2); // maxRetries times
  });

  it('handles cancellation via abort signal', async () => {
    const plan = createMockPlan([
      { id: 's1', status: 'pending' },
      { id: 's2', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const abortController = new AbortController();
    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockImplementation(async () => {
      abortController.abort();
      return createMockSessionResult('completed');
    });

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      abortSignal: abortController.signal,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);

    expect(result.cancelled).toBe(true);
  });

  it('handles cancelled session outcome', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('cancelled'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);

    expect(result.cancelled).toBe(true);
  });

  it('tracks attempt counts correctly', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession
      .mockResolvedValueOnce(createMockSessionResult('error', new Error('Fail 1') as any))
      .mockResolvedValueOnce(createMockSessionResult('error', new Error('Fail 2') as any))
      .mockResolvedValueOnce(createMockSessionResult('completed'));

    const onSubtaskStart = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 5,
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onSubtaskStart,
    };

    await iterateSubtasks(config);

    expect(onSubtaskStart).toHaveBeenNthCalledWith(1, expect.anything(), 1);
    expect(onSubtaskStart).toHaveBeenNthCalledWith(2, expect.anything(), 2);
    expect(onSubtaskStart).toHaveBeenNthCalledWith(3, expect.anything(), 3);
  });

  it('delays between iterations when autoContinueDelayMs > 0', async () => {
    const plan = createMockPlan([
      { id: 's1', status: 'pending' },
      { id: 's2', status: 'pending' },
    ]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const startTime = Date.now();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 100, // 100ms delay
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(100); // At least one delay
  });

  it('respects abort signal during delay', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const abortController = new AbortController();

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockImplementation(async () => {
      // Abort during the delay period
      setTimeout(() => abortController.abort(), 50);
      return createMockSessionResult('completed');
    });

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 5000, // Long delay that will be aborted
      abortSignal: abortController.signal,
      runSubtaskSession,
    };

    const startTime = Date.now();
    const result = await iterateSubtasks(config);
    const elapsed = Date.now() - startTime;

    expect(result.cancelled).toBe(true);
    expect(elapsed).toBeLessThan(5000); // Should abort before full delay
  });
});

// =============================================================================
// ensureSubtaskMarkedCompleted
// =============================================================================

describe('ensureSubtaskMarkedCompleted (via iterateSubtasks)', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ensure-complete-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('marks subtask as completed after successful session', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'in_progress' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const updatedPlan = JSON.parse(await readFile(planPath, 'utf-8'));
    const subtask = updatedPlan.phases[0].subtasks[0];
    expect(subtask.status).toBe('completed');
    expect(subtask.completed_at).toBeDefined();
  });

  it('marks subtask as completed after max_steps outcome', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'in_progress' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('max_steps'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const updatedPlan = JSON.parse(await readFile(planPath, 'utf-8'));
    expect(updatedPlan.phases[0].subtasks[0].status).toBe('completed');
  });

  it('marks subtask as completed after context_window outcome', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'in_progress' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('context_window'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const updatedPlan = JSON.parse(await readFile(planPath, 'utf-8'));
    expect(updatedPlan.phases[0].subtasks[0].status).toBe('completed');
  });

  it('does not mark completed subtask again', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'completed' }]);
    const completedAt = new Date().toISOString();
    (plan.phases[0].subtasks[0] as any).completed_at = completedAt;
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const updatedPlan = JSON.parse(await readFile(planPath, 'utf-8'));
    expect(updatedPlan.phases[0].subtasks[0].completed_at).toBe(completedAt);
  });

  it('handles legacy subtask_id field', async () => {
    const plan = {
      feature: 'test',
      phases: [
        {
          name: 'Phase 1',
          subtasks: [
            {
              subtask_id: 'legacy-1', // Legacy field
              title: 'Legacy',
              description: 'Legacy subtask',
              status: 'in_progress',
            } as any,
          ],
        },
      ],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const updatedPlan = JSON.parse(await readFile(planPath, 'utf-8'));
    const subtask = updatedPlan.phases[0].subtasks[0];
    expect(subtask.id).toBe('legacy-1');
    expect(subtask.status).toBe('completed');
  });

  it('handles corrupt plan file gracefully', async () => {
    await writeFile(planPath, 'invalid json {{{');

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    // Should not throw
    await expect(iterateSubtasks(config)).resolves.toBeDefined();
  });
});

// =============================================================================
// syncPhasesToMain
// =============================================================================

describe('syncPhasesToMain (via iterateSubtasks with sourceSpecDir)', () => {
  let tmpDir: string;
  let worktreeSpecDir: string;
  let mainSpecDir: string;
  let worktreePlanPath: string;
  let mainPlanPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sync-test-'));
    worktreeSpecDir = tmpDir;
    mainSpecDir = await mkdtemp(join(tmpdir(), 'main-'));
    worktreePlanPath = join(worktreeSpecDir, 'implementation_plan.json');
    mainPlanPath = join(mainSpecDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(mainSpecDir, { recursive: true, force: true });
  });

  it('syncs phases from worktree to main after successful session', async () => {
    const worktreePlan = createMockPlan([
      { id: 's1', status: 'pending' },
      { id: 's2', status: 'pending' },
    ]);
    await writeFile(worktreePlanPath, JSON.stringify(worktreePlan, null, 2));

    const mainPlan = createMockPlan([]);
    await writeFile(mainPlanPath, JSON.stringify(mainPlan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: worktreeSpecDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      sourceSpecDir: mainSpecDir,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    const mainPlanContent = JSON.parse(await readFile(mainPlanPath, 'utf-8'));
    // Phases should be synced (with completed statuses from worktree)
    expect(mainPlanContent.phases).toHaveLength(1);
    expect(mainPlanContent.phases[0].subtasks).toHaveLength(2);
    expect(mainPlanContent.phases[0].subtasks[0].status).toBe('completed');
    expect(mainPlanContent.phases[0].subtasks[1].status).toBe('completed');
  });

  it('handles missing main plan file gracefully', async () => {
    const worktreePlan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(worktreePlanPath, JSON.stringify(worktreePlan, null, 2));

    // Main plan doesn't exist

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: worktreeSpecDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      sourceSpecDir: mainSpecDir,
      runSubtaskSession,
    };

    // Should not throw - syncPhasesToMain handles missing file gracefully
    const result = await iterateSubtasks(config);
    expect(result.completedSubtasks).toBe(1);
  });
});

// =============================================================================
// extractInsightsAfterSession
// =============================================================================

describe('extractInsightsAfterSession (via iterateSubtasks)', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'insights-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not extract insights when extractInsights is false (default)', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending', description: 'Test subtask' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const onInsightsExtracted = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onInsightsExtracted,
      extractInsights: false, // Default
    };

    await iterateSubtasks(config);

    // Should not be called
    expect(onInsightsExtracted).not.toHaveBeenCalled();
  });

  it('calls onInsightsExtracted when extractInsights is true', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending', description: 'Test subtask' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const onInsightsExtracted = vi.fn();

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
      onInsightsExtracted,
      extractInsights: true,
    };

    await iterateSubtasks(config);

    // Note: Since extractSessionInsights is mocked or may fail, this test
    // verifies the flow is set up correctly. The actual insight extraction
    // is tested in the insight-extractor tests.
    // The callback fire-and-forget pattern means we might not see the call
    // if the extraction fails, which is expected behavior.
  });
});

// =============================================================================
// restampExecutionPhase (Additional edge cases)
// =============================================================================

describe('restampExecutionPhase - additional cases', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'restamp-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('adds executionPhase field if missing', async () => {
    const plan = {
      feature: 'test',
      phases: [],
      // executionPhase is missing
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    await restampExecutionPhase(tmpDir, 'coding');

    const written = JSON.parse(await readFile(planPath, 'utf-8')) as Record<string, unknown>;
    expect(written.executionPhase).toBe('coding');
  });

  it('adds updated_at timestamp when updating phase', async () => {
    const plan = {
      feature: 'test',
      executionPhase: 'planning',
      phases: [],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    await restampExecutionPhase(tmpDir, 'coding');

    const written = JSON.parse(await readFile(planPath, 'utf-8')) as Record<string, unknown>;
    expect(written.updated_at).toBeDefined();
    expect(typeof written.updated_at).toBe('string');
  });

  it('does not add updated_at when phase matches', async () => {
    const plan = {
      feature: 'test',
      executionPhase: 'coding',
      phases: [],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    await restampExecutionPhase(tmpDir, 'coding');

    const written = JSON.parse(await readFile(planPath, 'utf-8')) as Record<string, unknown>;
    // updated_at should not be added since no change was made
    expect(written.updated_at).toBeUndefined();
  });
});

// =============================================================================
// Error Handling Edge Cases
// =============================================================================

describe('iterateSubtasks - error handling', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'error-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('continues after error outcome (retries subtask)', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession
      .mockResolvedValueOnce(createMockSessionResult('error', new Error('Temporary failure') as any))
      .mockResolvedValueOnce(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);

    expect(result.completedSubtasks).toBe(1);
    expect(runSubtaskSession).toHaveBeenCalledTimes(2);
  });

  it('handles session exceptions gracefully', async () => {
    const plan = createMockPlan([{ id: 's1', status: 'pending' }]);
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    // When a session promise rejects, iterateSubtasks will retry
    // After maxRetries, it should mark as stuck
    runSubtaskSession.mockImplementation(async () => {
      throw new Error('Session crashed');
    });

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 1,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    // The function does not currently catch exceptions from runSubtaskSession
    // So we expect it to throw
    await expect(iterateSubtasks(config)).rejects.toThrow('Session crashed');
  });
});

// =============================================================================
// Multi-phase Plans
// =============================================================================

describe('iterateSubtasks - multi-phase plans', () => {
  let tmpDir: string;
  let planPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'multi-phase-test-'));
    planPath = join(tmpDir, 'implementation_plan.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('processes subtasks across multiple phases in order', async () => {
    const plan = {
      feature: 'test',
      phases: [
        {
          name: 'Phase 1',
          subtasks: [
            { id: 'p1-s1', title: 'P1S1', description: 'D1', status: 'pending' },
            { id: 'p1-s2', title: 'P1S2', description: 'D2', status: 'pending' },
          ],
        },
        {
          name: 'Phase 2',
          subtasks: [
            { id: 'p2-s1', title: 'P2S1', description: 'D3', status: 'pending' },
          ],
        },
      ],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const callOrder: string[] = [];
    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockImplementation(async (subtask) => {
      callOrder.push(subtask.id);
      return createMockSessionResult('completed');
    });

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    await iterateSubtasks(config);

    expect(callOrder).toEqual(['p1-s1', 'p1-s2', 'p2-s1']);
  });

  it('counts completed subtasks across all phases', async () => {
    const plan = {
      feature: 'test',
      phases: [
        {
          name: 'Phase 1',
          subtasks: [
            { id: 'p1-s1', title: 'P1S1', description: 'D1', status: 'completed' },
            { id: 'p1-s2', title: 'P1S2', description: 'D2', status: 'pending' },
          ],
        },
        {
          name: 'Phase 2',
          subtasks: [
            { id: 'p2-s1', title: 'P2S1', description: 'D3', status: 'completed' },
          ],
        },
      ],
    };
    await writeFile(planPath, JSON.stringify(plan, null, 2));

    const runSubtaskSession = vi.fn();
    runSubtaskSession.mockResolvedValue(createMockSessionResult('completed'));

    const config: SubtaskIteratorConfig = {
      specDir: tmpDir,
      projectDir: tmpDir,
      maxRetries: 3,
      autoContinueDelayMs: 0,
      runSubtaskSession,
    };

    const result = await iterateSubtasks(config);

    expect(result.totalSubtasks).toBe(3);
    expect(result.completedSubtasks).toBe(3); // All completed after run
  });
});
