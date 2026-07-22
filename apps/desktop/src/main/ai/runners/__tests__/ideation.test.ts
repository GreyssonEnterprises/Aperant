import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

const mockStreamText = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', count: n }),
}));

const mockCreateSimpleClient = vi.fn();

vi.mock('../../client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

const mockCodexRun = vi.fn();
const mockCodexCancel = vi.fn();
const mockWriteJsonWithRetry = vi.fn();

vi.mock('../../../services/codex/codex-execution-runtime', () => ({
  createMainCodexExecutionBackend: () => ({
    run: (...args: unknown[]) => mockCodexRun(...args),
    cancel: (...args: unknown[]) => mockCodexCancel(...args),
  }),
}));

vi.mock('../../../utils/atomic-file', () => ({
  writeJsonWithRetry: (...args: unknown[]) => mockWriteJsonWithRetry(...args),
}));

// Mock filesystem: prompt files exist by default
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

// Mock the tool registry so we don't need real tool initialization
vi.mock('../../tools/build-registry', () => ({
  buildToolRegistry: () => ({
    getToolsForAgent: vi.fn().mockReturnValue({}),
  }),
}));

// =============================================================================
// Import after mocking
// =============================================================================

import { runIdeation, IDEATION_TYPES, IDEATION_TYPE_LABELS } from '../ideation';
import type { IdeationConfig, IdeationStreamEvent } from '../ideation';

// =============================================================================
// Helpers
// =============================================================================

const fakeModel = { modelId: 'claude-sonnet-test' };

function makeMockClient() {
  return {
    model: fakeModel,
    systemPrompt: '',
    tools: {},
    maxSteps: 30,
  };
}

/**
 * Build an async generator that yields stream parts and then ends.
 */
function makeStream(parts: Array<Record<string, unknown>>) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
  };
}

function baseConfig(overrides: Partial<IdeationConfig> = {}): IdeationConfig {
  return {
    projectDir: '/project',
    outputDir: '/project/.auto-claude/ideation',
    promptsDir: '/app/prompts',
    ideationType: 'code_improvements',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('runIdeation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSimpleClient.mockResolvedValue(makeMockClient());
    mockCodexRun.mockResolvedValue({
      outcome: 'completed',
      stepsExecuted: 1,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      messages: [],
      durationMs: 1,
      toolCallCount: 0,
    });
    // Prompt file exists and has content by default
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('Analyze the codebase for improvements.');
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  it('exports all expected IDEATION_TYPES', () => {
    expect(IDEATION_TYPES).toContain('code_improvements');
    expect(IDEATION_TYPES).toContain('ui_ux_improvements');
    expect(IDEATION_TYPES).toContain('documentation_gaps');
    expect(IDEATION_TYPES).toContain('security_hardening');
    expect(IDEATION_TYPES).toContain('performance_optimizations');
    expect(IDEATION_TYPES).toContain('code_quality');
    expect(IDEATION_TYPES).toHaveLength(6);
  });

  it('exports human-readable labels for all ideation types', () => {
    for (const type of IDEATION_TYPES) {
      expect(IDEATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // Successful run
  // ---------------------------------------------------------------------------

  it('returns success with accumulated text from stream', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'text-delta', text: 'Found ' },
        { type: 'text-delta', text: '3 improvements.' },
      ]),
    );

    const result = await runIdeation(baseConfig());

    expect(result.success).toBe(true);
    expect(result.text).toBe('Found 3 improvements.');
    expect(result.error).toBeUndefined();
  });

  it('calls createSimpleClient with sonnet and medium thinking by default', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig());

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('sonnet');
    expect(clientArgs.thinkingLevel).toBe('medium');
  });

  it('accepts custom modelShorthand and thinkingLevel', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig({ modelShorthand: 'haiku', thinkingLevel: 'low' }));

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('haiku');
    expect(clientArgs.thinkingLevel).toBe('low');
  });

  it('runs Codex subscription models through the app-server backend', async () => {
    mockCreateSimpleClient.mockResolvedValue({
      ...makeMockClient(),
      resolvedModelId: 'gpt-5.6-sol',
      thinkingLevel: 'xhigh',
      queueAuth: {
        accountId: 'openai-subscription',
        executionBackend: 'codex-app-server',
        resolvedModelId: 'gpt-5.6-sol',
        resolvedProvider: 'openai',
        reasoningConfig: { type: 'reasoning_effort', level: 'xhigh' },
      },
    });
    const structuredOutput = {
      code_improvements: [{
        id: 'ci-001',
        type: 'code_improvements',
        title: 'Typed errors',
        description: 'Preserve structured backend errors.',
        rationale: 'The existing event model already supports them.',
        builds_upon: ['Existing event model'],
        estimated_effort: 'small',
        affected_files: ['src/errors.ts'],
        existing_patterns: ['Typed event payloads'],
        implementation_approach: 'Extend the existing event union.',
        status: 'draft',
        created_at: '2026-07-22T00:00:00.000Z',
      }],
    };
    mockCodexRun.mockResolvedValue({
      outcome: 'completed',
      structuredOutput,
      stepsExecuted: 1,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      messages: [],
      durationMs: 1,
      toolCallCount: 0,
    });

    const result = await runIdeation(baseConfig({
      modelShorthand: 'gpt-5.6-sol',
      thinkingLevel: 'xhigh',
    }));

    expect(result.success).toBe(true);
    expect(mockStreamText).not.toHaveBeenCalled();
    expect(mockCodexRun).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'openai-subscription',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'xhigh',
        worktreePath: '/project',
        sandboxMode: 'read-only',
        allowedWritePaths: [],
        specDir: '/project/.auto-claude/ideation',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
      expect.any(Function),
    );
    const codexConfig = mockCodexRun.mock.calls[0][0] as {
      outputSchema: { properties: Record<string, { items: { additionalProperties: boolean } }> };
    };
    expect(
      codexConfig.outputSchema.properties.code_improvements.items.additionalProperties,
    ).toBe(false);
    expect(mockWriteJsonWithRetry).toHaveBeenCalledWith(
      '/project/.auto-claude/ideation/code_improvements_ideas.json',
      structuredOutput,
    );
  });

  it('rejects invalid structured output from Codex without writing a category file', async () => {
    mockCreateSimpleClient.mockResolvedValue({
      ...makeMockClient(),
      resolvedModelId: 'gpt-5.6-sol',
      queueAuth: {
        accountId: 'openai-subscription',
        executionBackend: 'codex-app-server',
        reasoningConfig: { type: 'reasoning_effort', level: 'high' },
      },
    });
    mockCodexRun.mockResolvedValue({
      outcome: 'completed',
      structuredOutput: { code_improvements: [{ title: 'Missing required fields' }] },
    });

    const result = await runIdeation(baseConfig({ modelShorthand: 'gpt-5.6-sol' }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('valid structured ideation output');
    expect(mockWriteJsonWithRetry).not.toHaveBeenCalled();
  });

  it('rejects schema-incompatible extra fields from Codex', async () => {
    mockCreateSimpleClient.mockResolvedValue({
      ...makeMockClient(),
      resolvedModelId: 'gpt-5.6-sol',
      queueAuth: {
        accountId: 'openai-subscription',
        executionBackend: 'codex-app-server',
        reasoningConfig: { type: 'reasoning_effort', level: 'high' },
      },
    });
    mockCodexRun.mockResolvedValue({
      outcome: 'completed',
      structuredOutput: {
        code_improvements: [{
          id: 'ci-001', type: 'code_improvements', title: 'Title',
          description: 'Description', rationale: 'Rationale',
          builds_upon: [], estimated_effort: 'small', affected_files: [],
          existing_patterns: [], implementation_approach: 'Approach',
          status: 'draft', created_at: '2026-07-22T00:00:00.000Z',
          unexpected: 'must be rejected',
        }],
      },
    });

    const result = await runIdeation(baseConfig({ modelShorthand: 'gpt-5.6-sol' }));

    expect(result.success).toBe(false);
    expect(mockWriteJsonWithRetry).not.toHaveBeenCalled();
  });

  it('passes tools from client to streamText', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig());

    const streamArgs = mockStreamText.mock.calls[0][0];
    expect(streamArgs).toHaveProperty('tools');
    expect(streamArgs).toHaveProperty('model');
  });

  // ---------------------------------------------------------------------------
  // Stream callbacks
  // ---------------------------------------------------------------------------

  it('forwards text-delta events to onStream callback', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'text-delta', text: 'hello' },
        { type: 'text-delta', text: ' world' },
      ]),
    );

    const events: IdeationStreamEvent[] = [];
    await runIdeation(baseConfig(), (e) => events.push(e));

    const textEvents = events.filter((e) => e.type === 'text-delta');
    expect(textEvents).toHaveLength(2);
    expect((textEvents[0] as { type: 'text-delta'; text: string }).text).toBe('hello');
  });

  it('forwards tool-use events from tool-call stream parts', async () => {
    mockStreamText.mockReturnValue(
      makeStream([{ type: 'tool-call', toolName: 'Glob', toolCallId: 'c1', input: {} }]),
    );

    const events: IdeationStreamEvent[] = [];
    await runIdeation(baseConfig(), (e) => events.push(e));

    const toolEvents = events.filter((e) => e.type === 'tool-use');
    expect(toolEvents).toHaveLength(1);
    expect((toolEvents[0] as { type: 'tool-use'; name: string }).name).toBe('Glob');
  });

  it('forwards error events from stream error parts', async () => {
    mockStreamText.mockReturnValue(
      makeStream([{ type: 'error', error: new Error('stream error') }]),
    );

    const events: IdeationStreamEvent[] = [];
    await runIdeation(baseConfig(), (e) => events.push(e));

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { type: 'error'; error: string }).error).toBe('stream error');
  });

  // ---------------------------------------------------------------------------
  // Prompt file not found
  // ---------------------------------------------------------------------------

  it('returns failure when prompt file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await runIdeation(baseConfig());

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
    expect(result.error).toContain('Prompt not found');
  });

  it('returns failure when prompt file cannot be read', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await runIdeation(baseConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  // ---------------------------------------------------------------------------
  // Error handling — streamText throws
  // ---------------------------------------------------------------------------

  it('returns failure when streamText iteration throws', async () => {
    mockStreamText.mockReturnValue({
      // biome-ignore lint/correctness/useYield: intentionally throwing before yield to test error path
      fullStream: (async function* () {
        throw new Error('API error');
      })(),
    });

    const result = await runIdeation(baseConfig());

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
  });

  it('emits error event to callback when streamText throws', async () => {
    mockStreamText.mockReturnValue({
      // biome-ignore lint/correctness/useYield: intentionally throwing before yield to test error path
      fullStream: (async function* () {
        throw new Error('network failure');
      })(),
    });

    const events: IdeationStreamEvent[] = [];
    await runIdeation(baseConfig(), (e) => events.push(e));

    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Ideation type routing — checks the correct prompt file is loaded
  // ---------------------------------------------------------------------------

  it.each(IDEATION_TYPES)('loads the correct prompt file for ideation type: %s', async (type) => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig({ ideationType: type }));

    // The prompt file for each type should have been checked for existence
    expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('.md'));
  });

  // ---------------------------------------------------------------------------
  // Context injection
  // ---------------------------------------------------------------------------

  it('includes projectDir and outputDir in the prompt passed to streamText', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(
      baseConfig({ projectDir: '/my/project', outputDir: '/my/project/.auto-claude/ideation' }),
    );

    // The system prompt passed to streamText should contain the project dir
    const streamArgs = mockStreamText.mock.calls[0][0];
    const systemPrompt = streamArgs.system as string;
    expect(systemPrompt).toContain('/my/project');
  });

  it('injects maxIdeasPerType into the context', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig({ maxIdeasPerType: 10 }));

    const streamArgs = mockStreamText.mock.calls[0][0];
    const systemPrompt = streamArgs.system as string;
    expect(systemPrompt).toContain('10');
  });

  it('names the exact category output file in the user prompt', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runIdeation(baseConfig({ ideationType: 'ui_ux_improvements' }));

    const streamArgs = mockStreamText.mock.calls[0][0];
    expect(streamArgs.prompt).toContain(
      '/project/.auto-claude/ideation/ui_ux_improvements_ideas.json',
    );
    expect(streamArgs.prompt).toContain('"ui_ux_improvements"');
  });
});
