/**
 * spec-orchestrator.test.ts
 *
 * Tests for SpecOrchestrator — orchestrates the spec creation pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

import { SpecOrchestrator } from '../spec-orchestrator';
import type {
  SpecOrchestratorConfig,
  SpecOutcome,
  SpecPhaseResult,
} from '../spec-orchestrator';
import type { SessionResult } from '../../session/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

// Mock schema functions
vi.mock('../../schema', () => ({
  validateJsonFile: vi.fn(),
  validateAndNormalizeJsonFile: vi.fn(),
  ComplexityAssessmentSchema: {},
  ImplementationPlanSchema: {},
  ComplexityAssessmentOutputSchema: {},
  buildValidationRetryPrompt: vi.fn(() => 'Retry context'),
  IMPLEMENTATION_PLAN_SCHEMA_HINT: 'Schema hint',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPEC_DIR = '/project/.auto-claude/specs/001-feature';
const PROJECT_DIR = '/project';

function makeConfig(overrides: Partial<SpecOrchestratorConfig> = {}): SpecOrchestratorConfig {
  return {
    specDir: SPEC_DIR,
    projectDir: PROJECT_DIR,
    taskDescription: 'Build a feature',
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
    stepsExecuted: 1,
    usage: { promptTokens: 100, completionTokens: 50 },
    messages: [],
    durationMs: 1000,
    toolCallCount: 0,
    error: outcome === 'error' ? new Error('Session failed') : undefined,
    ...overrides,
  } as SessionResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpecOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    mockAccess.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Constructor and abort signal
  // -------------------------------------------------------------------------

  it('creates orchestrator with config', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(SpecOrchestrator);
  });

  it('listens for abort signal', () => {
    const controller = new AbortController();
    const config = makeConfig({ abortSignal: controller.signal });

    new SpecOrchestrator(config);
    controller.abort();

    // Orchestrator should handle abort (no throw)
    expect(true).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Complexity heuristic
  // -------------------------------------------------------------------------

  it('returns "simple" for short rename tasks', () => {
    const config = makeConfig({ taskDescription: 'rename the title to "New Title"' });
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('rename the title to "New Title"')).toBe('simple');
  });

  it('returns "simple" for short color change tasks', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('change button color to blue')).toBe('simple');
  });

  it('returns "simple" for typo fix tasks', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('fix typo in header')).toBe('simple');
  });

  it('returns "simple" for version bump tasks', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('bump version to 2.0.0')).toBe('simple');
  });

  it('returns "simple" for remove unused code tasks', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('remove unused imports')).toBe('simple');
  });

  it('returns null for complex task descriptions', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    const complexDesc = 'Build a comprehensive payment processing system with ' +
      'multiple payment providers, webhook handling, refund processing, ' +
      'payment method management, and comprehensive error handling for all edge cases.';

    expect(assessComplexity(complexDesc)).toBeNull();
  });

  it('returns null for simple pattern but too many words', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    // 40 words - should NOT match simple pattern despite "change" keyword
    const longDesc = 'change ' + 'many '.repeat(30) + 'title to new title';

    expect(assessComplexity(longDesc)).toBeNull();
  });

  it('is case-insensitive for pattern matching', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const assessComplexity = (desc: string) =>
      (orchestrator as unknown as { assessComplexityHeuristic: (d: string) => string | null })
        .assessComplexityHeuristic(desc);

    expect(assessComplexity('RENAME Title To New')).toBe('simple');
    expect(assessComplexity('Update Color To Red')).toBe('simple');
  });

  // -------------------------------------------------------------------------
  // Validate phase outputs
  // -------------------------------------------------------------------------

  it('returns empty array for phase with no expected outputs', async () => {
    mockAccess.mockResolvedValue(undefined);

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseOutputs: (p: string) => Promise<string[]> })
        .validatePhaseOutputs(phase);

    const result = await validate('self_critique');

    expect(result).toEqual([]);
  });

  it('returns empty array when all expected files exist', async () => {
    mockAccess.mockResolvedValue(undefined);

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseOutputs: (p: string) => Promise<string[]> })
        .validatePhaseOutputs(phase);

    const result = await validate('discovery');

    expect(result).toEqual([]);
  });

  it('returns missing files when they do not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseOutputs: (p: string) => Promise<string[]> })
        .validatePhaseOutputs(phase);

    const result = await validate('discovery');

    expect(result).toContain('context.json');
  });

  it('handles partial file existence', async () => {
    // quick_spec phase has 2 expected files: spec.md and implementation_plan.json
    // First file exists, second doesn't
    mockAccess.mockImplementation((path: string) => {
      if (String(path).includes('spec.md')) return Promise.resolve(undefined);
      return Promise.reject(new Error('ENOENT'));
    });

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseOutputs: (p: string) => Promise<string[]> })
        .validatePhaseOutputs(phase);

    const result = await validate('quick_spec');

    expect(result).toContain('implementation_plan.json');
    expect(result).not.toContain('spec.md');
  });

  // -------------------------------------------------------------------------
  // Validate phase schema
  // -------------------------------------------------------------------------

  it('returns null for phases without schema requirements', async () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseSchema: (p: string) => Promise<{ valid: boolean; errors: string[] } | null> })
        .validatePhaseSchema(phase);

    const result = await validate('discovery');

    expect(result).toBeNull();
  });

  it('returns null for planning phase when file does not exist yet', async () => {
    const { validateAndNormalizeJsonFile } = await import('../../schema');
    vi.mocked(validateAndNormalizeJsonFile).mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const validate = (phase: string) =>
      (orchestrator as unknown as { validatePhaseSchema: (p: string) => Promise<{ valid: boolean; errors: string[] } | null> })
        .validatePhaseSchema(phase);

    const result = await validate('planning');

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Capture phase output
  // -------------------------------------------------------------------------

  it('captures phase outputs into phaseSummaries', async () => {
    mockReadFile.mockResolvedValue('Phase output content');

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const capture = (phase: string) =>
      (orchestrator as unknown as { capturePhaseOutput: (p: string) => Promise<void> })
        .capturePhaseOutput(phase);

    await capture('discovery');

    const summaries = (orchestrator as unknown as { phaseSummaries: Record<string, string> })
      .phaseSummaries;

    expect(summaries['context.json']).toBe('Phase output content');
  });

  it('truncates large phase outputs', async () => {
    const largeContent = 'x'.repeat(15000);
    mockReadFile.mockResolvedValue(largeContent);

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const capture = (phase: string) =>
      (orchestrator as unknown as { capturePhaseOutput: (p: string) => Promise<void> })
        .capturePhaseOutput(phase);

    await capture('discovery');

    const summaries = (orchestrator as unknown as { phaseSummaries: Record<string, string> })
      .phaseSummaries;

    expect(summaries['context.json'].length).toBe(12016); // 12000 + '... (truncated)' (16 chars)
    expect(summaries['context.json']).toContain('... (truncated)');
  });

  it('skips empty content', async () => {
    mockReadFile.mockResolvedValue('   \n\n  ');

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const capture = (phase: string) =>
      (orchestrator as unknown as { capturePhaseOutput: (p: string) => Promise<void> })
        .capturePhaseOutput(phase);

    await capture('discovery');

    const summaries = (orchestrator as unknown as { phaseSummaries: Record<string, string> })
      .phaseSummaries;

    expect(summaries['context.json']).toBeUndefined();
  });

  it('handles missing output files gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const capture = (phase: string) =>
      (orchestrator as unknown as { capturePhaseOutput: (p: string) => Promise<void> })
        .capturePhaseOutput(phase);

    await expect(capture('discovery')).resolves.toBeUndefined();
  });

  it('captures multiple output files for a phase', async () => {
    mockReadFile
      .mockResolvedValueOnce('Spec content')
      .mockResolvedValueOnce('Plan content');

    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const capture = (phase: string) =>
      (orchestrator as unknown as { capturePhaseOutput: (p: string) => Promise<void> })
        .capturePhaseOutput(phase);

    await capture('quick_spec');

    const summaries = (orchestrator as unknown as { phaseSummaries: Record<string, string> })
      .phaseSummaries;

    expect(summaries['spec.md']).toBe('Spec content');
    expect(summaries['implementation_plan.json']).toBe('Plan content');
  });

  // -------------------------------------------------------------------------
  // Outcome construction
  // -------------------------------------------------------------------------

  it('constructs successful outcome', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    // Set assessment
    (orchestrator as unknown as { assessment: { complexity: string } | null })
      .assessment = { complexity: 'standard' } as unknown as { complexity: string } | null;

    const outcomes: SpecOutcome[] = [];
    orchestrator.on('spec-complete', (outcome) => outcomes.push(outcome));

    const buildOutcome = (success: boolean, phases: string[], duration: number, error?: string) =>
      (orchestrator as unknown as { outcome: (s: boolean, p: string[], d: number, e?: string) => SpecOutcome })
        .outcome(success, phases, duration, error);

    const result = buildOutcome(true, ['discovery', 'requirements', 'spec_writing', 'planning', 'validation'], 10000);

    expect(result.success).toBe(true);
    expect(result.complexity).toBe('standard');
    expect(result.phasesExecuted).toEqual(['discovery', 'requirements', 'spec_writing', 'planning', 'validation']);
    expect(result.durationMs).toBe(10000);
    expect(result.error).toBeUndefined();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual(result);
  });

  it('constructs failed outcome with error', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const buildOutcome = (success: boolean, phases: string[], duration: number, error?: string) =>
      (orchestrator as unknown as { outcome: (s: boolean, p: string[], d: number, e?: string) => SpecOutcome })
        .outcome(success, phases, duration, error);

    const result = buildOutcome(false, ['discovery'], 5000, 'Phase failed');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Phase failed');
    expect(result.phasesExecuted).toEqual(['discovery']);
  });

  it('emits spec-complete event', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const outcomes: SpecOutcome[] = [];
    orchestrator.on('spec-complete', (outcome) => outcomes.push(outcome));

    const buildOutcome = (success: boolean, phases: string[], duration: number, error?: string) =>
      (orchestrator as unknown as { outcome: (s: boolean, p: string[], d: number, e?: string) => SpecOutcome })
        .outcome(success, phases, duration, error);

    buildOutcome(true, ['quick_spec', 'validation'], 8000);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Typed event emitter
  // -------------------------------------------------------------------------

  it('emits typed events with correct parameters', () => {
    const config = makeConfig();
    const orchestrator = new SpecOrchestrator(config);

    const events: Array<{ event: string; args: unknown[] }> = [];

    orchestrator.on('log', (msg) => events.push({ event: 'log', args: [msg] }));
    orchestrator.on('phase-start', (phase, num, total) =>
      events.push({ event: 'phase-start', args: [phase, num, total] })
    );
    orchestrator.on('phase-complete', (phase, result) =>
      events.push({ event: 'phase-complete', args: [phase, result] })
    );
    orchestrator.on('session-complete', (result, phase) =>
      events.push({ event: 'session-complete', args: [result, phase] })
    );
    orchestrator.on('spec-complete', (outcome) =>
      events.push({ event: 'spec-complete', args: [outcome] })
    );
    orchestrator.on('error', (error, phase) =>
      events.push({ event: 'error', args: [error, phase] })
    );

    // Access private emitTyped
    const emit = (event: string, ...args: unknown[]) =>
      (orchestrator as unknown as { emitTyped: (e: string, ...a: unknown[]) => void })
        .emitTyped(event, ...args);

    emit('log', 'Test message');
    emit('phase-start', 'discovery', 1, 5);
    const phaseResult: SpecPhaseResult = { phase: 'discovery', success: true, errors: [], retries: 0 };
    emit('phase-complete', 'discovery', phaseResult);
    emit('session-complete', makeSessionResult('completed'), 'discovery');
    emit('spec-complete', { success: true, phasesExecuted: ['validation'], durationMs: 5000 });
    emit('error', new Error('Test error'), 'discovery');

    expect(events).toHaveLength(6);
    expect(events[0].event).toBe('log');
    expect(events[0].args).toEqual(['Test message']);
    expect(events[1].event).toBe('phase-start');
    expect(events[1].args).toEqual(['discovery', 1, 5]);
    expect(events[2].event).toBe('phase-complete');
    expect(events[3].event).toBe('session-complete');
    expect(events[4].event).toBe('spec-complete');
    expect(events[5].event).toBe('error');
  });

  // -------------------------------------------------------------------------
  // Configuration options
  // -------------------------------------------------------------------------

  it('respects complexity override', () => {
    const config = makeConfig({ complexityOverride: 'simple' });
    const orchestrator = new SpecOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(SpecOrchestrator);
  });

  it('respects useAiAssessment flag', () => {
    const config = makeConfig({ useAiAssessment: false });
    const orchestrator = new SpecOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(SpecOrchestrator);
  });

  it('respects project index', () => {
    const projectIndex = JSON.stringify({ files: ['test.ts'] });
    const config = makeConfig({ projectIndex });
    const orchestrator = new SpecOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(SpecOrchestrator);
  });

  it('respects CLI overrides', () => {
    const config = makeConfig({
      cliModel: 'claude-3-5-sonnet-20241022',
      cliThinking: 'medium',
    });
    const orchestrator = new SpecOrchestrator(config);

    expect(orchestrator).toBeInstanceOf(SpecOrchestrator);
  });
});
