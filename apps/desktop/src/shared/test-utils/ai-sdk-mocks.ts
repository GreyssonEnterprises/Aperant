/**
 * Vercel AI SDK Mock Utilities
 * ============================
 *
 * Mock helpers for Vercel AI SDK v6 functions (generateText, streamText).
 * Supports single-pass review and multi-turn agent session mocking.
 */

/**
 * Mock generateText response for single-pass review
 *
 * @param result - Mock result object
 * @returns Mocked generateText return value
 *
 * @example
 * ```ts
 * const mockResult = mockGenerateText({
 *   text: '{"findings": [{"id": "SEC-1", "severity": "high"}]}',
 *   usage: { promptTokens: 1000, completionTokens: 500 }
 * });
 *
 * vi.mocked(generateText).mockResolvedValue(mockResult);
 * ```
 */
export interface MockGenerateTextResult {
  text?: string;
  object?: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'error';
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
}

export function mockGenerateText(result: MockGenerateTextResult = {}): {
  text: string;
  object?: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'error';
  warnings?: unknown[];
  response?: unknown;
} {
  return {
    text: result.text || '',
    object: result.object,
    usage: result.usage || {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500
    },
    finishReason: result.finishReason || 'stop',
    toolCalls: result.toolCalls
  } as unknown as {
    text: string;
    object?: unknown;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    finishReason: 'stop' | 'length' | 'error';
  };
}

/**
 * Mock streamText steps for multi-turn agent sessions
 *
 * Simulates a multi-step agent session with tool calls.
 *
 * @param steps - Array of mock steps
 * @returns Mock streamText result with async iterator
 *
 * @example
 * ```ts
 * const mockStream = mockStreamText([
 *   {
 *     text: 'Let me check the code...',
 *     toolCalls: [{ toolName: 'read_file', args: { path: 'src/test.ts' } }]
 *   },
 *   {
 *     text: 'Found the issue!',
 *     finishReason: 'stop'
 *   }
 * ]);
 *
 * vi.mocked(streamText).mockReturnValue(mockStream);
 * ```
 */
export interface MockStreamStep {
  text?: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  finishReason?: 'stop' | 'length' | 'error';
  toolResults?: Array<{
    toolCallId: string;
    result: unknown;
  }>;
}

/**
 * Counter for generating deterministic tool call IDs
 */
let toolCallIdCounter = 0;

/**
 * Generate a deterministic tool call ID
 *
 * @param toolName - Name of the tool
 * @returns Deterministic tool call ID
 */
function generateToolCallId(toolName: string): string {
  return `mock-${toolName}-${toolCallIdCounter++}`;
}

export function mockStreamText(steps: MockStreamStep[] = []): {
  toDataStreamStream: () => ReadableStream;
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: 'stop' | 'length' | 'error';
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  fullStream: AsyncIterable<unknown>;
} {
  const allText = steps.map(s => s.text || '').join('');

  // Precompute deterministic toolCallIds for each tool call in each step
  const stepToolCallIds: Array<Array<string>> = steps.map(step =>
    (step.toolCalls || []).map(tc => generateToolCallId(tc.toolName))
  );

  // Build allToolCalls using precomputed IDs
  const allToolCalls = steps.flatMap((step, stepIndex) =>
    (step.toolCalls || []).map((tc, toolIndex) => ({
      toolCallId: stepToolCallIds[stepIndex][toolIndex],
      toolName: tc.toolName,
      args: tc.args
    }))
  );

  // Create async generator for fullStream
  async function* generateSteps() {
    for (const step of steps) {
      yield {
        type: 'text-delta',
        textDelta: step.text || ''
      };

      if (step.toolCalls && step.toolCalls.length > 0) {
        const stepIndex = steps.indexOf(step);
        for (const tc of step.toolCalls) {
          const toolIndex = step.toolCalls!.indexOf(tc);
          yield {
            type: 'tool-call',
            toolName: tc.toolName,
            toolCallId: stepToolCallIds[stepIndex][toolIndex],
            args: tc.args
          };
        }
      }

      // Emit toolResults if present
      if (step.toolResults && step.toolResults.length > 0) {
        for (const tr of step.toolResults) {
          yield {
            type: 'tool-result',
            toolCallId: tr.toolCallId,
            result: tr.result
          };
        }
      }

      if (step.finishReason) {
        yield {
          type: 'finish',
          finishReason: step.finishReason,
          usage: {
            promptTokens: 1000,
            completionTokens: 500
          }
        };
      }
    }
  }

  return {
    toDataStreamStream: () =>
      new ReadableStream({
        async start(controller) {
          for (const step of steps) {
            if (step.text) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text-delta', textDelta: step.text })}\n\n`)
              );
            }
          }
          controller.close();
        }
      }),
    text: allText,
    usage: {
      promptTokens: 1000 * steps.length,
      completionTokens: 500 * steps.length,
      totalTokens: 1500 * steps.length
    },
    finishReason: steps[steps.length - 1]?.finishReason || 'stop',
    toolCalls: allToolCalls,
    fullStream: generateSteps()
  };
}

/**
 * Create mock AI client
 *
 * Returns a minimal mock client with model and systemPrompt.
 *
 * @param modelOverride - Optional model name override
 * @param systemPromptOverride - Optional system prompt override
 * @returns Mock client object
 *
 * @example
 * ```ts
 * const client = createMockAIClient('claude-3-5-sonnet-20241022');
 * expect(client.model).toBe('claude-3-5-sonnet-20241022');
 * ```
 */
export function createMockAIClient(
  modelOverride: string = 'claude-3-5-sonnet-20241022',
  systemPromptOverride: string = 'You are a helpful assistant.'
): {
  model: string;
  systemPrompt: string;
} {
  return {
    model: modelOverride,
    systemPrompt: systemPromptOverride
  };
}

/**
 * Mock AI SDK tool execution
 *
 * Creates a mock tool result for testing tool call handling.
 *
 * @param toolName - Name of the tool
 * @param result - Tool execution result
 * @param toolCallId - Optional explicit tool call ID (for deterministic testing)
 * @returns Mock tool result
 *
 * @example
 * ```ts
 * // Auto-generated ID (non-deterministic)
 * const mockResult = mockToolResult('read_file', {
 *   file_path: 'src/test.ts',
 *   content: 'export const test = true;'
 * });
 *
 * // Explicit ID (deterministic, correlates with mockStreamText)
 * const mockResult = mockToolResult('read_file', {
 *   file_path: 'src/test.ts',
 *   content: 'export const test = true;'
 * }, 'mock-read_file-0');
 * ```
 */
export function mockToolResult<T = unknown>(
  toolName: string,
  result: T,
  toolCallId?: string
): {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: T;
} {
  return {
    toolCallId: toolCallId || generateToolCallId(toolName),
    toolName,
    args: {},
    result
  };
}

/**
 * Mock conversation history
 *
 * Creates a mock array of message objects for testing.
 *
 * @param userMessages - Array of user message strings
 * @param assistantMessages - Array of assistant message strings
 * @returns Mock conversation history
 *
 * @example
 * ```ts
 * const history = mockConversationHistory(
 *   ['Review this PR', 'Check for security issues'],
 *   ['I will review it', 'Found 2 security issues']
 * );
 * ```
 */
export function mockConversationHistory(
  userMessages: string[] = [],
  assistantMessages: string[] = []
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let i = 0; i < Math.max(userMessages.length, assistantMessages.length); i++) {
    if (i < userMessages.length) {
      history.push({ role: 'user', content: userMessages[i] });
    }
    if (i < assistantMessages.length) {
      history.push({ role: 'assistant', content: assistantMessages[i] });
    }
  }

  return history;
}
