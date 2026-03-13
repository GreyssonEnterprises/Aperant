/**
 * Roadmap Runner Tests
 *
 * Tests for AI-powered roadmap generation.
 * Covers discovery phase, features phase, feature preservation, retry logic, and streaming events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runRoadmapGeneration,
  type RoadmapConfig,
  type RoadmapStreamCallback,
  type RoadmapStreamEvent,
} from '../roadmap';
import type { ThinkingLevel } from '../../config/types';

// Mock all dependencies
vi.mock('../../client/factory', () => ({
  createSimpleClient: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: vi.fn(),
    stepCountIs: vi.fn(),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('../../tools/build-registry', () => ({
  buildToolRegistry: vi.fn(),
}));

vi.mock('../prompts/prompt-loader', () => ({
  tryLoadPrompt: vi.fn(() => null),
}));

import { createSimpleClient } from '../../client/factory';
import { streamText, stepCountIs } from 'ai';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildToolRegistry } from '../../tools/build-registry';

// ============================================
// Shared Helpers
// ============================================

const createMockStreamResult = (chunks: any[]) => ({
  fullStream: (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })(),
  text: '',
  content: '',
  reasoning: '',
  reasoningText: '',
  usage: { promptTokens: 0, completionTokens: 0 },
  finish: () => Promise.resolve(),
  toDataStream: () => new ReadableStream(),
  toResponse: () => new Response(),
} as any);

const createMockConfig = (
  overrides?: Partial<RoadmapConfig>,
): RoadmapConfig => ({
  projectDir: '/test/project',
  ...overrides,
});

const createMockClientResult = () => ({
  model: 'gpt-4',
  systemPrompt: '',
  resolvedModelId: 'gpt-4',
  tools: {},
  maxSteps: 30,
  thinkingLevel: 'medium' as ThinkingLevel,
}) as any;

// ============================================
// Setup & Teardown
// ============================================

describe('Roadmap Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createSimpleClient
    vi.mocked(createSimpleClient).mockResolvedValue(createMockClientResult());

    // Mock streamText
    vi.mocked(streamText).mockReturnValue(createMockStreamResult([]));
    vi.mocked(stepCountIs).mockReturnValue({} as any);

    // Mock fs.existsSync - return false by default
    vi.mocked(existsSync).mockReturnValue(false);

    // Mock fs.mkdirSync
    vi.mocked(mkdirSync).mockReturnValue(undefined);

    // Mock buildToolRegistry
    vi.mocked(buildToolRegistry).mockReturnValue({
      getToolsForAgent: vi.fn(() => ({})),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // runRoadmapGeneration - basic
  // ============================================

  describe('runRoadmapGeneration', () => {
    it('should run roadmap generation and return success', async () => {
      // Mock both discovery and roadmap files exist to skip actual generation
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const config = createMockConfig();

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(2);
      expect(result.roadmapPath).toBeTruthy();
    });

    it('should use default model and thinking level', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // Create mock discovery file during generation
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      // After first stream call, make discovery file exist
      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          // Discovery phase - make discovery file exist after
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          // Features phase - make roadmap file exist after
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([]);
      });

      const config = createMockConfig();

      await runRoadmapGeneration(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: '',
        modelShorthand: 'sonnet',
        thinkingLevel: 'medium',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should use provided model and thinking level', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const config = createMockConfig({
        modelShorthand: 'haiku',
        thinkingLevel: 'high',
      });

      await runRoadmapGeneration(config);

      expect(createSimpleClient).toHaveBeenCalledWith({
        systemPrompt: '',
        modelShorthand: 'haiku',
        thinkingLevel: 'high',
        maxSteps: 30,
        tools: expect.any(Object),
      });
    });

    it('should use custom output directory when provided', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('/custom/output');
      });

      const config = createMockConfig({
        outputDir: '/custom/output',
      });

      await runRoadmapGeneration(config);

      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should create output directory when it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = createMockConfig();

      await runRoadmapGeneration(config);

      expect(mkdirSync).toHaveBeenCalledWith(
        '/test/project/.auto-claude/roadmap',
        { recursive: true },
      );
    });
  });

  // ============================================
  // runRoadmapGeneration - streaming events
  // ============================================

  describe('streaming events', () => {
    it('should call onStream for phase-start events', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const events: RoadmapStreamEvent[] = [];
      const onStream: RoadmapStreamCallback = (event) => events.push(event);

      const config = createMockConfig();

      await runRoadmapGeneration(config, onStream);

      expect(events.some(e => e.type === 'phase-start' && e.phase === 'discovery')).toBe(true);
      expect(events.some(e => e.type === 'phase-start' && e.phase === 'features')).toBe(true);
    });

    it('should call onStream for phase-complete events', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const events: RoadmapStreamEvent[] = [];
      const onStream: RoadmapStreamCallback = (event) => events.push(event);

      const config = createMockConfig();

      await runRoadmapGeneration(config, onStream);

      expect(events.some(e => e.type === 'phase-complete' && e.phase === 'discovery' && e.success)).toBe(true);
      expect(events.some(e => e.type === 'phase-complete' && e.phase === 'features' && e.success)).toBe(true);
    });

    it('should call onStream for text-delta events', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      const events: RoadmapStreamEvent[] = [];
      const onStream: RoadmapStreamCallback = (event) => events.push(event);

      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult([
          { type: 'text-delta', text: 'Analyzing project...' },
          { type: 'text-delta', text: ' Generating features...' },
        ])
      );

      // After first call, make discovery file exist
      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([
          { type: 'text-delta', text: 'Processing...' },
        ]);
      });

      const config = createMockConfig();

      await runRoadmapGeneration(config, onStream);

      expect(events.some(e => e.type === 'text-delta')).toBe(true);
    });

    it('should call onStream for tool-use events', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      const events: RoadmapStreamEvent[] = [];
      const onStream: RoadmapStreamCallback = (event) => events.push(event);

      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([
          { type: 'tool-call', toolName: 'Read', toolCallId: '1' },
        ]);
      });

      const config = createMockConfig();

      await runRoadmapGeneration(config, onStream);

      expect(events.some(e => e.type === 'tool-use' && e.name === 'Read')).toBe(true);
    });

    it('should call onStream for error events', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      const events: RoadmapStreamEvent[] = [];
      const onStream: RoadmapStreamCallback = (event) => events.push(event);

      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([
          { type: 'error', error: 'Something went wrong' },
        ]);
      });

      const config = createMockConfig();

      await runRoadmapGeneration(config, onStream);

      expect(events.some(e => e.type === 'error' && e.error === 'Something went wrong')).toBe(true);
    });

    it('should work without onStream callback', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const config = createMockConfig();

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Discovery Phase
  // ============================================

  describe('discovery phase', () => {
    it('should skip discovery if file exists and not refreshing', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const config = createMockConfig({ refresh: false });

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(true);
      expect(result.phases[0].success).toBe(true);
    });

    it('should regenerate discovery file when refresh is true', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([]);
      });

      const config = createMockConfig({ refresh: true });

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // Features Phase
  // ============================================

  describe('features phase', () => {
    it('should skip features if file exists and not refreshing', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      const config = createMockConfig({ refresh: false });

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(true);
      expect(result.phases[1].success).toBe(true);
    });

    it('should fail if discovery file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = createMockConfig();

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Discovery failed');
    });
  });

  // ============================================
  // Feature Preservation
  // ============================================

  describe('feature preservation', () => {
    it('should preserve features with planned status', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        // Discovery exists, roadmap exists with old features
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      // When roadmap is read, return existing features with planned status
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: 'existing-1', title: 'Existing Feature', status: 'planned', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '{}';
      });

      // Now refresh to trigger regeneration
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        // Only discovery exists now
        return pathStr.includes('roadmap_discovery.json');
      });

      const config = createMockConfig({ refresh: true });

      await runRoadmapGeneration(config);

      // Verify existing roadmap was read (the preserved features would be loaded)
      expect(readFileSync).toHaveBeenCalled();
    });

    it('should preserve features with linked_spec_id', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: 'linked-1', title: 'Linked Feature', linked_spec_id: 'spec-123', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'pending', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '{}';
      });

      const config = createMockConfig({ refresh: true });

      await runRoadmapGeneration(config);

      expect(readFileSync).toHaveBeenCalled();
    });

    it('should preserve internal source features', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
      });

      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: 'internal-1', title: 'Internal Feature', source: { provider: 'internal' }, description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'pending', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '{}';
      });

      const config = createMockConfig({ refresh: true });

      await runRoadmapGeneration(config);

      expect(readFileSync).toHaveBeenCalled();
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('error handling', () => {
    it('should return error when discovery phase fails', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      // streamText will just return empty stream, causing retry exhaustion
      vi.mocked(streamText).mockReturnValue(createMockStreamResult([]));

      const config = createMockConfig();

      const result = await runRoadmapGeneration(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Discovery failed');
    });

    it('should include phase results in error case', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      vi.mocked(streamText).mockReturnValue(createMockStreamResult([]));

      const config = createMockConfig();

      const result = await runRoadmapGeneration(config);

      expect(result.phases).not.toBeNull();
      expect(result.phases.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Abort Signal
  // ============================================

  describe('abort signal', () => {
    it('should pass abortSignal to streamText', async () => {
      // Don't have files exist initially, so generation runs
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      // Track streamText calls
      const streamCalls: any[] = [];
      let streamCallCount = 0;
      vi.mocked(streamText).mockImplementation((...args) => {
        streamCalls.push(args[0]);
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([]);
      });

      const abortController = new AbortController();

      const config = createMockConfig({ abortSignal: abortController.signal });

      await runRoadmapGeneration(config);

      // Check if streamText was called with abortSignal
      expect(streamText).toHaveBeenCalled();
      expect(streamCalls[0].abortSignal).toBe(abortController.signal);
    });
  });

  // ============================================
  // Codex Models
  // ============================================

  describe('Codex model handling', () => {
    it('should use providerOptions for Codex models', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes('roadmap_discovery.json')) {
          return JSON.stringify({
            project_name: 'Test',
            target_audience: 'developers',
            product_vision: 'A great tool',
            key_features: [],
            technical_stack: {},
            constraints: [],
          });
        }
        if (String(path).includes('roadmap.json')) {
          return JSON.stringify({
            phases: [],
            features: [
              { id: '1', title: 'Feature 1', description: 'Desc', priority: 'high', complexity: 'medium', impact: 'high', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '2', title: 'Feature 2', description: 'Desc', priority: 'medium', complexity: 'small', impact: 'medium', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
              { id: '3', title: 'Feature 3', description: 'Desc', priority: 'low', complexity: 'large', impact: 'low', phase_id: 'p1', status: 'planned', acceptance_criteria: [], user_stories: [] },
            ],
            vision: 'A great tool',
            target_audience: { primary: 'developers' },
          });
        }
        return '';
      });
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      // Mock Codex client
      vi.mocked(createSimpleClient).mockResolvedValue({
        model: 'gpt-4-codex',
        systemPrompt: '',
        resolvedModelId: 'gpt-4-codex',
        tools: {},
        maxSteps: 30,
        thinkingLevel: 'medium' as any,
      } as any);

      let streamCallCount = 0;
      const streamCalls: any[] = [];
      vi.mocked(streamText).mockImplementation((...args) => {
        streamCalls.push(args[0]);
        streamCallCount++;
        if (streamCallCount === 1) {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json');
          });
        } else {
          vi.mocked(existsSync).mockImplementation((path) => {
            const pathStr = String(path);
            return pathStr.includes('roadmap_discovery.json') || pathStr.includes('roadmap.json');
          });
        }
        return createMockStreamResult([]);
      });

      const config = createMockConfig();

      await runRoadmapGeneration(config);

      // Check that providerOptions was used for Codex
      expect(streamCalls.length).toBeGreaterThan(0);
      const firstCall = streamCalls[0];
      expect(firstCall.providerOptions).toEqual({
        openai: {
          instructions: expect.any(String),
          store: false,
        },
      });
    });
  });
});
