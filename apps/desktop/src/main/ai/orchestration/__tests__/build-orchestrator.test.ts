/**
 * build-orchestrator.test.ts
 *
 * Tests for BuildOrchestrator — orchestrates the full build lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { BuildOrchestrator } from '../build-orchestrator';
import type {
  BuildOrchestratorConfig,
  PromptContext,
  SessionRunConfig,
  BuildOutcome,
} from '../build-orchestrator';
import type { SessionResult } from '../../session/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockUnlink = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

// Mock iterateSubtasks since it's tested separately
vi.mock('../subtask-iterator', () => ({
  iterateSubtasks: vi.fn(),
}));

// Mock schema functions
vi.mock('../../schema', () => ({
  validateAndNormalizeJsonFile: vi.fn(),
  ImplementationPlanSchema: {},
  ImplementationPlanOutputSchema: {},
  repairJsonWithLLM: vi.fn(),
  buildValidationRetryPrompt: vi.fn(() => 'Retry context'),
  IMPLEMENTATION_PLAN_SCHEMA_HINT: 'Schema hint',
}));

// Mock json-repair
vi.mock('../../../utils/json-repair', () => ({
  safeParseJson: <T>(raw: string) => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
}));

// Mock phase protocol functions
vi.mock('../../../../shared/constants/phase-protocol', () => ({
  isTerminalPhase: (phase: string) =>
    ['complete', 'failed', 'cancelled'].includes(phase),
  isValidPhaseTransition: vi.fn(() => true),
}));

import { iterateSubtasks } from '../subtask-iterator';
import { validateAndNormalizeJsonFile } from '../../schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPEC_DIR = '/project/.auto-claude/specs/001-feature';
const PROJECT_DIR = '/project';

function makeConfig(overrides: Partial<BuildOrchestratorConfig> = {}): BuildOrchestratorConfig {
  return {
    specDir: SPEC_DIR,
    projectDir: PROJECT_DIR,
    generatePrompt: vi.fn().mockResolvedValue('system prompt'),
    runSession: vi.fn().mockResolvedValue({
      outcome: 'completed',
      totalSteps: 1,
      lastMessage: '',
      stepsExecuted: 1,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      messages: [],
      durationMs: 1000,
      toolCallCount: 0,
    } as SessionResult),
    ...overrides,
  };
}

function makeSessionResult(
  outcome: SessionResult['outcome'],
  overrides: Partial<SessionResult> = {}
): SessionResult {
  return {
    outcome,
    totalSteps: 1,
    lastMessage: '',
    error: outcome === 'error' ? new Error('Session failed') : undefined,
    ...overrides,
  } as SessionResult;
}

// Valid implementation plan structure
const validPlan = {
  phases: [
    {
      name: 'Implementation',
      subtasks: [
        { id: 't1', description: 'Task 1', status: 'pending' },
        { id: 't2', description: 'Task 2', status: 'pending' },
      ],
    },
  ],
};

const completedPlan = {
  phases: [
    {
      name: 'Implementation',
      subtasks: [
        { id: 't1', description: 'Task 1', status: 'completed' },
        { id: 't2', description: 'Task 2', status: 'completed' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Constructor and abort signal
  // -------------------------------------------------------------------------

  it('creates orchestrator with config', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(BuildOrchestrator);
  });

  it('listens for abort signal', () => {
    const controller = new AbortController();
    const config = makeConfig({ abortSignal: controller.signal });

    new BuildOrchestrator(config);
    controller.abort();

    // Orchestrator should handle abort (no throw)
    expect(true).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Phase transition validation
  // -------------------------------------------------------------------------

  it('emits phase-change event on transition', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const phaseChanges: Array<{ phase: string; message: string }> = [];
    orchestrator.on('phase-change', (phase, message) => {
      phaseChanges.push({ phase, message });
    });

    // Access private method via type assertion for testing
    (orchestrator as unknown as { transitionPhase: (p: string, m: string) => void })
      .transitionPhase('planning', 'Starting planning');

    expect(phaseChanges).toHaveLength(1);
    expect(phaseChanges[0].phase).toBe('planning');
    expect(phaseChanges[0].message).toBe('Starting planning');
  });

  it('blocks phase transition from terminal phase', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const logs: string[] = [];
    orchestrator.on('log', (msg) => logs.push(msg));

    // Move to terminal phase
    (orchestrator as unknown as { transitionPhase: (p: string, m: string) => void })
      .transitionPhase('complete', 'Done');

    // Try to transition away from terminal (should be blocked)
    (orchestrator as unknown as { transitionPhase: (p: string, m: string) => void })
      .transitionPhase('planning', 'Restart');

    expect(logs).toHaveLength(0); // No log emitted for blocked transition
  });

  // -------------------------------------------------------------------------
  // Mark phase completed
  // -------------------------------------------------------------------------

  it('marks phases as completed without duplicates', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    // Access private method
    const markPhase = (phase: string) =>
      (orchestrator as unknown as { markPhaseCompleted: (p: string) => void })
        .markPhaseCompleted(phase);

    markPhase('planning');
    markPhase('coding');
    markPhase('planning'); // Duplicate

    const completed = (orchestrator as unknown as { completedPhases: string[] })
      .completedPhases;

    expect(completed).toEqual(['planning', 'coding']);
  });

  // -------------------------------------------------------------------------
  // Build outcome construction
  // -------------------------------------------------------------------------

  it('constructs successful build outcome', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    // Pre-complete coding phase
    (orchestrator as unknown as { completedPhases: string[] })
      .completedPhases = ['coding'];

    const outcomes: BuildOutcome[] = [];
    orchestrator.on('build-complete', (outcome) => outcomes.push(outcome));

    const result = orchestrator.run();

    // Access private helper
    const buildOutcome = (success: boolean, durationMs: number, error?: string) =>
      (orchestrator as unknown as { buildOutcome: (s: boolean, d: number, e?: string) => BuildOutcome })
        .buildOutcome(success, durationMs, error);

    const outcome = buildOutcome(true, 5000);

    expect(outcome.success).toBe(true);
    expect(outcome.finalPhase).toBeDefined();
    expect(outcome.totalIterations).toBe(0);
    expect(outcome.durationMs).toBe(5000);
    expect(outcome.codingCompleted).toBe(true);
    expect(outcome.error).toBeUndefined();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual(outcome);
  });

  it('constructs failed build outcome', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const buildOutcome = (success: boolean, durationMs: number, error?: string) =>
      (orchestrator as unknown as { buildOutcome: (s: boolean, d: number, e?: string) => BuildOutcome })
        .buildOutcome(success, durationMs, error);

    const outcome = buildOutcome(false, 3000, 'Something went wrong');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Something went wrong');
    expect(outcome.codingCompleted).toBe(false);
  });

  it('transitions to failed when outcome is failure and not terminal', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const phaseChanges: Array<{ phase: string; message: string }> = [];
    orchestrator.on('phase-change', (phase, message) => {
      phaseChanges.push({ phase, message });
    });

    const buildOutcome = (success: boolean, durationMs: number, error?: string) =>
      (orchestrator as unknown as { buildOutcome: (s: boolean, d: number, e?: string) => BuildOutcome })
        .buildOutcome(success, durationMs, error);

    buildOutcome(false, 1000, 'Failed');

    expect(phaseChanges.some(c => c.phase === 'failed')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Typed event emitter
  // -------------------------------------------------------------------------

  it('emits typed events with correct parameters', () => {
    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const events: Array<{ event: string; args: unknown[] }> = [];

    orchestrator.on('log', (msg) => events.push({ event: 'log', args: [msg] }));
    orchestrator.on('phase-change', (phase, msg) =>
      events.push({ event: 'phase-change', args: [phase, msg] })
    );
    orchestrator.on('iteration-start', (iter, phase) =>
      events.push({ event: 'iteration-start', args: [iter, phase] })
    );
    orchestrator.on('session-complete', (result, phase) =>
      events.push({ event: 'session-complete', args: [result, phase] })
    );
    orchestrator.on('build-complete', (outcome) =>
      events.push({ event: 'build-complete', args: [outcome] })
    );
    orchestrator.on('error', (error, phase) =>
      events.push({ event: 'error', args: [error, phase] })
    );

    // Access private emitTyped
    const emitTyped = (event: string, ...args: unknown[]) =>
      (orchestrator as unknown as { emitTyped: (e: any, ...a: unknown[]) => void })
        .emitTyped(event as any, ...args);

    emitTyped('log', 'Test message');
    emitTyped('phase-change', 'planning', 'Starting');
    emitTyped('iteration-start', 1, 'coding');
    emitTyped('session-complete', makeSessionResult('completed'), 'coding');
    emitTyped('build-complete', { success: true, finalPhase: 'complete', totalIterations: 1, durationMs: 1000, codingCompleted: true });
    emitTyped('error', new Error('Test error'), 'planning');

    expect(events).toHaveLength(6);
    expect(events[0].event).toBe('log');
    expect(events[0].args).toEqual(['Test message']);
    expect(events[1].event).toBe('phase-change');
    expect(events[1].args).toEqual(['planning', 'Starting']);
    expect(events[2].event).toBe('iteration-start');
    expect(events[2].args).toEqual([1, 'coding']);
    expect(events[3].event).toBe('session-complete');
    expect(events[4].event).toBe('build-complete');
    expect(events[5].event).toBe('error');
  });

  // -------------------------------------------------------------------------
  // State queries: isFirstRun
  // -------------------------------------------------------------------------

  it('returns true for first run when plan does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isFirstRun = (orchestrator as unknown as { isFirstRun: () => Promise<boolean> })
      .isFirstRun();

    await expect(isFirstRun).resolves.toBe(true);
  });

  it('returns false for subsequent runs when plan exists', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validPlan));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isFirstRun = (orchestrator as unknown as { isFirstRun: () => Promise<boolean> })
      .isFirstRun();

    await expect(isFirstRun).resolves.toBe(false);
  });

  // -------------------------------------------------------------------------
  // State queries: isBuildComplete
  // -------------------------------------------------------------------------

  it('returns false when plan file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isComplete = (orchestrator as unknown as { isBuildComplete: () => Promise<boolean> })
      .isBuildComplete();

    await expect(isComplete).resolves.toBe(false);
  });

  it('returns false when plan contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('invalid json');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isComplete = (orchestrator as unknown as { isBuildComplete: () => Promise<boolean> })
      .isBuildComplete();

    await expect(isComplete).resolves.toBe(false);
  });

  it('returns true when all subtasks are completed', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(completedPlan));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isComplete = (orchestrator as unknown as { isBuildComplete: () => Promise<boolean> })
      .isBuildComplete();

    await expect(isComplete).resolves.toBe(true);
  });

  it('returns false when any subtask is not completed', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validPlan));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isComplete = (orchestrator as unknown as { isBuildComplete: () => Promise<boolean> })
      .isBuildComplete();

    await expect(isComplete).resolves.toBe(false);
  });

  it('returns false when some subtasks are completed but not all', async () => {
    const partiallyComplete = {
      phases: [
        {
          name: 'Implementation',
          subtasks: [
            { id: 't1', description: 'Task 1', status: 'completed' },
            { id: 't2', description: 'Task 2', status: 'pending' },
          ],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(partiallyComplete));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const isComplete = (orchestrator as unknown as { isBuildComplete: () => Promise<boolean> })
      .isBuildComplete();

    await expect(isComplete).resolves.toBe(false);
  });

  // -------------------------------------------------------------------------
  // State queries: readQAStatus
  // -------------------------------------------------------------------------

  it('returns "passed" when qa_report contains Status: Passed', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nStatus: Passed');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<{ passed: string } | { failed: string } | { unknown: string }> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('passed');
  });

  it('returns "passed" when qa_report contains Status: Approved', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nStatus: Approved');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('passed');
  });

  it('returns "failed" when qa_report contains Status: Failed', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nStatus: Failed');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('failed');
  });

  it('returns "failed" when qa_report contains Status: Rejected', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nStatus: Rejected');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('failed');
  });

  it('returns "failed" when qa_report contains Status: Needs Changes', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nStatus: Needs Changes');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('failed');
  });

  it('returns "unknown" when qa_report exists but has no recognized status', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nSome content here');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('unknown');
  });

  it('returns "unknown" when qa_report does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('unknown');
  });

  it('is case-insensitive when detecting status', async () => {
    mockReadFile.mockResolvedValue('# QA Report\n\nSTATUS: PASSED');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const readStatus = (orchestrator as unknown as { readQAStatus: () => Promise<string> })
      .readQAStatus();

    await expect(readStatus).resolves.toBe('passed');
  });

  // -------------------------------------------------------------------------
  // State queries: resetQAReport
  // -------------------------------------------------------------------------

  it('deletes qa_report.md when it exists', async () => {
    mockUnlink.mockResolvedValue(undefined);

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const resetReport = (orchestrator as unknown as { resetQAReport: () => Promise<void> })
      .resetQAReport();

    await resetReport;

    expect(mockUnlink).toHaveBeenCalledWith(join(SPEC_DIR, 'qa_report.md'));
  });

  it('handles missing qa_report.md gracefully', async () => {
    mockUnlink.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const resetReport = (orchestrator as unknown as { resetQAReport: () => Promise<void> })
      .resetQAReport();

    await expect(resetReport).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Reset subtask statuses
  // -------------------------------------------------------------------------

  it('resets all subtask statuses to "pending"', async () => {
    const planWithCompleted = {
      phases: [
        {
          name: 'Implementation',
          subtasks: [
            { id: 't1', description: 'Task 1', status: 'completed' },
            { id: 't2', description: 'Task 2', status: 'completed' },
          ],
        },
      ],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(planWithCompleted));
    mockWriteFile.mockResolvedValue(undefined);

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const logs: string[] = [];
    orchestrator.on('log', (msg) => logs.push(msg));

    const resetStatuses = (orchestrator as unknown as { resetSubtaskStatuses: () => Promise<void> })
      .resetSubtaskStatuses();

    await resetStatuses;

    expect(mockWriteFile).toHaveBeenCalled();
    const writtenPlan = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenPlan.phases[0].subtasks[0].status).toBe('pending');
    expect(writtenPlan.phases[0].subtasks[1].status).toBe('pending');
    expect(logs).toContain('Reset all subtask statuses to "pending" after planning');
  });

  it('does not write file when all subtasks are already pending', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validPlan));
    mockWriteFile.mockResolvedValue(undefined);

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const resetStatuses = (orchestrator as unknown as { resetSubtaskStatuses: () => Promise<void> })
      .resetSubtaskStatuses();

    await resetStatuses;

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles plan file read errors gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const resetStatuses = (orchestrator as unknown as { resetSubtaskStatuses: () => Promise<void> })
      .resetSubtaskStatuses();

    await expect(resetStatuses).resolves.toBeUndefined();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('handles invalid JSON gracefully', async () => {
    mockReadFile.mockResolvedValue('invalid json');

    const config = makeConfig();
    const orchestrator = new BuildOrchestrator(config);

    const resetStatuses = (orchestrator as unknown as { resetSubtaskStatuses: () => Promise<void> })
      .resetSubtaskStatuses();

    await expect(resetStatuses).resolves.toBeUndefined();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
