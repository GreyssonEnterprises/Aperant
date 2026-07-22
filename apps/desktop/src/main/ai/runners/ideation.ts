/**
 * Ideation Runner
 * ===============
 *
 * AI-powered idea generation using Vercel AI SDK.
 * See apps/desktop/src/main/ai/runners/ideation.ts for the TypeScript implementation.
 *
 * Uses `createSimpleClient()` with read-only tools and streaming to generate
 * ideas of different types: code improvements, UI/UX, documentation, security,
 * performance, and code quality.
 */

import { streamText, stepCountIs } from 'ai';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createSimpleClient } from '../client/factory';
import { buildToolRegistry } from '../tools/build-registry';
import type { ToolContext } from '../tools/types';
import type { ModelShorthand, ThinkingLevel } from '../config/types';
import type { SecurityProfile } from '../security/bash-validator';
import { createMainCodexExecutionBackend } from '../../services/codex/codex-execution-runtime';
import { writeJsonWithRetry } from '../../utils/atomic-file';

// =============================================================================
// Constants
// =============================================================================

/** Supported ideation types */
export const IDEATION_TYPES = [
  'code_improvements',
  'ui_ux_improvements',
  'documentation_gaps',
  'security_hardening',
  'performance_optimizations',
  'code_quality',
] as const;

export type IdeationType = (typeof IDEATION_TYPES)[number];

/** Human-readable labels for ideation types */
export const IDEATION_TYPE_LABELS: Record<IdeationType, string> = {
  code_improvements: 'Code Improvements',
  ui_ux_improvements: 'UI/UX Improvements',
  documentation_gaps: 'Documentation Gaps',
  security_hardening: 'Security Hardening',
  performance_optimizations: 'Performance Optimizations',
  code_quality: 'Code Quality & Refactoring',
};

/** Prompt file mapping per ideation type */
const IDEATION_TYPE_PROMPTS: Record<IdeationType, string> = {
  code_improvements: 'ideation_code_improvements.md',
  ui_ux_improvements: 'ideation_ui_ux.md',
  documentation_gaps: 'ideation_documentation.md',
  security_hardening: 'ideation_security.md',
  performance_optimizations: 'ideation_performance.md',
  code_quality: 'ideation_code_quality.md',
};

// =============================================================================
// Types
// =============================================================================

/** Configuration for running ideation */
export interface IdeationConfig {
  /** Project directory path */
  projectDir: string;
  /** Output directory for results */
  outputDir: string;
  /** Prompts directory containing ideation prompt files */
  promptsDir: string;
  /** Type of ideation to run */
  ideationType: IdeationType;
  /** Model shorthand (defaults to 'sonnet') */
  modelShorthand?: ModelShorthand | string;
  /** Thinking level (defaults to 'medium') */
  thinkingLevel?: ThinkingLevel;
  /** Maximum ideas per type (defaults to 5) */
  maxIdeasPerType?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result of an ideation run */
export interface IdeationResult {
  /** Whether the run succeeded */
  success: boolean;
  /** Full response text from the agent */
  text: string;
  /** Error message if failed */
  error?: string;
}

/** Callback for streaming events from the ideation runner */
export type IdeationStreamCallback = (event: IdeationStreamEvent) => void;

/** Events emitted during ideation streaming */
export type IdeationStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-use'; name: string }
  | { type: 'error'; error: string };

type IdeaPropertySchema =
  | { type: 'string'; const?: string }
  | { type: 'boolean' }
  | { type: 'array'; items: { type: 'string' } };

function buildIdeaProperties(ideationType: IdeationType): Record<string, IdeaPropertySchema> {
  const string = { type: 'string' } as const;
  const stringArray = { type: 'array', items: string } as const;
  const common = {
    id: string,
    type: { type: 'string', const: ideationType } as const,
    title: string,
    description: string,
    rationale: string,
  };
  switch (ideationType) {
    case 'code_improvements':
      return {
        ...common,
        builds_upon: stringArray,
        estimated_effort: string,
        affected_files: stringArray,
        existing_patterns: stringArray,
        implementation_approach: string,
        status: string,
        created_at: string,
      };
    case 'ui_ux_improvements':
      return {
        ...common,
        category: string,
        affected_components: stringArray,
        screenshots: stringArray,
        current_state: string,
        proposed_change: string,
        user_benefit: string,
        status: string,
        created_at: string,
      };
    case 'documentation_gaps':
      return {
        ...common,
        category: string,
        targetAudience: string,
        affectedAreas: stringArray,
        currentDocumentation: string,
        proposedContent: string,
        priority: string,
        estimatedEffort: string,
      };
    case 'security_hardening':
      return {
        ...common,
        category: string,
        severity: string,
        affectedFiles: stringArray,
        vulnerability: string,
        currentRisk: string,
        remediation: string,
        references: stringArray,
        compliance: stringArray,
      };
    case 'performance_optimizations':
      return {
        ...common,
        category: string,
        impact: string,
        affectedAreas: stringArray,
        currentMetric: string,
        expectedImprovement: string,
        implementation: string,
        tradeoffs: string,
        estimatedEffort: string,
      };
    case 'code_quality':
      return {
        ...common,
        category: string,
        severity: string,
        affectedFiles: stringArray,
        currentState: string,
        proposedChange: string,
        codeExample: string,
        bestPractice: string,
        estimatedEffort: string,
        breakingChange: { type: 'boolean' },
        prerequisites: stringArray,
      };
  }
}

function matchesIdeaProperty(value: unknown, schema: IdeaPropertySchema): boolean {
  if (schema.type === 'string') {
    return typeof value === 'string' && value.trim().length > 0 &&
      (schema.const === undefined || value === schema.const);
  }
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function buildIdeationOutputSchema(ideationType: IdeationType, maxIdeas: number) {
  const ideaProperties = buildIdeaProperties(ideationType);
  return {
    type: 'object',
    additionalProperties: false,
    required: [ideationType],
    properties: {
      [ideationType]: {
        type: 'array',
        maxItems: maxIdeas,
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(ideaProperties),
          properties: ideaProperties,
        },
      },
    },
  } as const;
}

function isValidIdeationOutput(
  value: Record<string, unknown> | undefined,
  ideationType: IdeationType,
  maxIdeas: number,
): value is Record<IdeationType, Array<Record<string, unknown>>> {
  if (!value || Object.keys(value).length !== 1) return false;
  const ideas = value[ideationType];
  if (!Array.isArray(ideas) || ideas.length > maxIdeas) return false;
  const properties = buildIdeaProperties(ideationType);
  const expectedKeys = Object.keys(properties);
  return ideas.every((idea) => {
    if (!idea || typeof idea !== 'object' || Array.isArray(idea)) return false;
    const record = idea as Record<string, unknown>;
    const keys = Object.keys(record);
    return keys.length === expectedKeys.length && keys.every((key) => key in properties) &&
      expectedKeys.every((key) => matchesIdeaProperty(record[key], properties[key]));
  });
}

// =============================================================================
// Ideation Runner
// =============================================================================

/**
 * Run an ideation agent for a specific ideation type.
 *
 * Loads the appropriate prompt, creates a simple client with read-only tools,
 * and streams the response. Mirrors Python's `IdeationGenerator.run_agent()`.
 *
 * @param config - Ideation configuration
 * @param onStream - Optional callback for streaming events
 * @returns Ideation result
 */
export async function runIdeation(
  config: IdeationConfig,
  onStream?: IdeationStreamCallback,
): Promise<IdeationResult> {
  const {
    projectDir,
    outputDir,
    promptsDir,
    ideationType,
    modelShorthand = 'sonnet',
    thinkingLevel = 'medium',
    maxIdeasPerType = 5,
    abortSignal,
  } = config;

  // Load prompt file
  const promptFile = IDEATION_TYPE_PROMPTS[ideationType];
  const promptPath = join(promptsDir, promptFile);

  if (!existsSync(promptPath)) {
    return {
      success: false,
      text: '',
      error: `Prompt not found: ${promptPath}`,
    };
  }

  let prompt: string;
  try {
    prompt = readFileSync(promptPath, 'utf-8');
  } catch (error) {
    return {
      success: false,
      text: '',
      error: `Failed to read prompt: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Add context to prompt (matches Python format)
  prompt += `\n\n---\n\n**Output Directory**: ${outputDir}\n`;
  prompt += `**Project Directory**: ${projectDir}\n`;
  prompt += `**Max Ideas**: ${maxIdeasPerType}\n`;

  // Create tool context for read-only tools
  const toolContext: ToolContext = {
    cwd: projectDir,
    projectDir,
    specDir: join(projectDir, '.auto-claude', 'specs'),
    securityProfile: null as unknown as SecurityProfile,
    abortSignal,
  };

  // Bind read-only tools + Write for output
  const registry = buildToolRegistry();
  const tools = registry.getToolsForAgent('ideation', toolContext);

  // Create simple client
  const client = await createSimpleClient({
    systemPrompt: '',
    modelShorthand,
    thinkingLevel,
    maxSteps: 30,
    tools,
  });

  let responseText = '';

  // Detect Codex models — they require instructions via providerOptions, not system
  const modelId = typeof client.model === 'string' ? client.model : client.model.modelId;
  const isCodex = modelId?.includes('codex') ?? false;
  const outputFile = join(outputDir, `${ideationType}_ideas.json`);
  const userPrompt = `Analyze the project at ${projectDir} and generate up to ${maxIdeasPerType} ${ideationType.replace(/_/g, ' ')} ideas. Use the available tools to explore the codebase. Write valid JSON to ${outputFile} with "${ideationType}" as the top-level array key.`;

  try {
    if (client.queueAuth?.executionBackend === 'codex-app-server') {
      mkdirSync(outputDir, { recursive: true });
      const backend = createMainCodexExecutionBackend();
      const cancel = () => { void backend.cancel(); };
      abortSignal?.addEventListener('abort', cancel, { once: true });
      try {
        const outputSchema = buildIdeationOutputSchema(ideationType, maxIdeasPerType);
        const codexSystemPrompt = `${prompt}\n\n## HOST EXECUTION CONTRACT\n` +
          'This Codex run is read-only. Do not create, edit, or delete files, even when earlier ' +
          'instructions say the output file is mandatory. Aperant will persist the final response. ' +
          'Return only the JSON object required by the supplied output schema.';
        const codexPrompt = `Analyze the project at ${projectDir} and generate up to ` +
          `${maxIdeasPerType} ${ideationType.replace(/_/g, ' ')} ideas. Explore the codebase using ` +
          `read-only operations, then return only JSON with "${ideationType}" as the top-level key.`;
        const result = await backend.run({
          taskId: `ideation-${ideationType}`,
          accountId: client.queueAuth.accountId,
          modelId: client.resolvedModelId,
          reasoningEffort: client.queueAuth.reasoningConfig.level ?? thinkingLevel,
          systemPrompt: codexSystemPrompt,
          input: codexPrompt,
          worktreePath: projectDir,
          sandboxMode: 'read-only',
          allowedWritePaths: [],
          specDir: outputDir,
          phase: `ideation-read-only-${ideationType.replace(/_/g, '-')}`,
          outputSchema,
        }, (event) => {
          if (event.type !== 'stream-event') return;
          if (event.data.type === 'text-delta') {
            responseText += event.data.text;
            onStream?.({ type: 'text-delta', text: event.data.text });
          } else if (event.data.type === 'tool-call') {
            onStream?.({ type: 'tool-use', name: event.data.toolName });
          } else if (event.data.type === 'error') {
            onStream?.({ type: 'error', error: event.data.error.message });
          }
        });
        if (result.outcome !== 'completed') {
          return {
            success: false,
            text: responseText,
            error: result.error?.message ?? `Codex ideation ended with ${result.outcome}`,
          };
        }
        if (!isValidIdeationOutput(result.structuredOutput, ideationType, maxIdeasPerType)) {
          return {
            success: false,
            text: responseText,
            error: 'Codex did not return valid structured ideation output',
          };
        }
        await writeJsonWithRetry(outputFile, result.structuredOutput);
        return { success: true, text: responseText };
      } finally {
        abortSignal?.removeEventListener('abort', cancel);
      }
    }

    const result = streamText({
      model: client.model,
      system: isCodex ? undefined : prompt,
      prompt: userPrompt,
      tools: client.tools,
      stopWhen: stepCountIs(client.maxSteps),
      abortSignal,
      ...(isCodex ? {
        providerOptions: {
          openai: {
            instructions: prompt,
            store: false,
          },
        },
      } : {}),
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          responseText += part.text;
          onStream?.({ type: 'text-delta', text: part.text });
          break;
        }
        case 'tool-call': {
          onStream?.({ type: 'tool-use', name: part.toolName });
          break;
        }
        case 'error': {
          const errorMsg =
            part.error instanceof Error ? part.error.message : String(part.error);
          onStream?.({ type: 'error', error: errorMsg });
          break;
        }
      }
    }

    return {
      success: true,
      text: responseText,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onStream?.({ type: 'error', error: errorMsg });
    return {
      success: false,
      text: responseText,
      error: errorMsg,
    };
  }
}
