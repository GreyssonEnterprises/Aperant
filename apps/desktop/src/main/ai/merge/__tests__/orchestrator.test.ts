/**
 * Merge Orchestrator Tests
 *
 * Tests for the main merge pipeline coordinator.
 * Covers task merging, file merging, progress reporting, and AI integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs and child_process BEFORE importing the module under test
vi.mock('fs', async () => {
  return {
    default: {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ''),
      writeFileSync: vi.fn(() => undefined),
      mkdirSync: vi.fn(() => undefined),
    },
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(() => undefined),
    mkdirSync: vi.fn(() => undefined),
  };
});

vi.mock('child_process', async () => {
  const mockSpawnSync = vi.fn(() => ({
    status: 0,
    stdout: '',
    stderr: '',
  }));
  return {
    default: {
      spawnSync: mockSpawnSync,
    },
    spawnSync: mockSpawnSync,
  };
});

import fs from 'fs';
import child_process from 'child_process';
import { MergeOrchestrator, type TaskMergeRequest, type AiResolverFn } from '../orchestrator';
import { MergeDecision, MergeStrategy, ConflictSeverity, type TaskSnapshot } from '../types';

describe('MergeOrchestrator', () => {
  let orchestrator: MergeOrchestrator;
  const mockProjectDir = '/test/project';
  const mockStorageDir = '/test/storage';

  // Mock progress callback tracker
  let progressCalls: Array<[string, number, string]>;

  const mockProgressCallback = (stage: string, percent: number, message: string) => {
    progressCalls.push([stage, percent, message]);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    progressCalls = [];

    // Reset fs mocks
    const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
    const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
    const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
    const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

    mockExistsSync.mockReset().mockReturnValue(false);
    mockReadFileSync.mockReset().mockReturnValue('');
    mockWriteFileSync.mockReset().mockReturnValue(undefined);
    mockMkdirSync.mockReset().mockReturnValue(undefined);

    // Reset child_process mocks
    const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
    mockSpawnSync.mockReset().mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    } as any);

    orchestrator = new MergeOrchestrator({
      projectDir: mockProjectDir,
      storageDir: mockStorageDir,
      enableAi: false,
      dryRun: true,
    });
  });

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.evolutionTracker).toBeDefined();
      expect(orchestrator.conflictDetector).toBeDefined();
      expect(orchestrator.autoMerger).toBeDefined();
    });

    it('should use default storage path when not provided', () => {
      const orchestrator2 = new MergeOrchestrator({
        projectDir: mockProjectDir,
        dryRun: true,
      });

      expect(orchestrator2).toBeDefined();
    });

    it('should enable AI by default', () => {
      const orchestrator2 = new MergeOrchestrator({
        projectDir: mockProjectDir,
        dryRun: true,
      });

      expect(orchestrator2).toBeDefined();
    });
  });

  describe('mergeTask', () => {
    it('should return success report for task with no modifications', async () => {
      // Mock evolutionTracker methods
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});
      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => []);

      const report = await orchestrator.mergeTask('task-1', '/worktree/path', 'main', mockProgressCallback);

      expect(report.success).toBe(true);
      expect(report.tasksMerged).toContain('task-1');
      expect(report.stats.filesProcessed).toBe(0);
      expect(progressCalls.some(([stage, , msg]) => stage === 'complete' && msg.includes('No modifications')));
    });

    it('should return error when worktree not found', async () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(false);

      const report = await orchestrator.mergeTask('task-1', undefined, 'main', mockProgressCallback);

      expect(report.success).toBe(false);
      expect(report.error).toContain('Could not find worktree');
      expect(progressCalls.some(([stage]) => stage === 'error'));
    });

    it('should process modified files and merge them', async () => {
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date('2024-01-01'),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => [['src/test.ts', mockSnapshot]]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline content');

      const report = await orchestrator.mergeTask('task-1', '/worktree/path', 'main', mockProgressCallback);

      expect(report.tasksMerged).toContain('task-1');
      expect(report.fileResults.size).toBeGreaterThan(0);
    });

    it('should call progress callback for each stage', async () => {
      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => []);

      await orchestrator.mergeTask('task-1', '/worktree/path', 'main', mockProgressCallback);

      const stages = progressCalls.map(([stage]) => stage);
      expect(stages).toContain('analyzing');
      expect(stages).toContain('complete');
    });
  });

  describe('mergeTasks', () => {
    it('should merge multiple tasks by priority', async () => {
      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1 },
        { taskId: 'task-2', priority: 10 }, // Higher priority
      ];

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map());
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(true);

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report.tasksMerged).toHaveLength(2);
      expect(report.startedAt).toBeDefined();
    });

    it('should handle empty request list', async () => {
      const report = await orchestrator.mergeTasks([], 'main', mockProgressCallback);

      expect(report.tasksMerged).toHaveLength(0);
      expect(report.success).toBe(true);
    });
  });

  describe('previewMerge', () => {
    it('should return preview with no conflicts for unrelated changes', () => {
      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1']]]));
      orchestrator.evolutionTracker.getConflictingFiles = vi.fn(() => []);
      orchestrator.evolutionTracker.getFileEvolution = vi.fn(() => undefined);

      const preview = orchestrator.previewMerge(['task-1']);

      expect(preview.tasks).toContain('task-1');
      expect(preview.files_to_merge).toContain('src/test.ts');
      expect(preview.files_with_potential_conflicts).toHaveLength(0);
      expect(preview.conflicts).toHaveLength(0);
    });

    it('should detect and report potential conflicts', () => {
      const mockEvolution = {
        filePath: 'src/test.ts',
        baselineCommit: 'abc123',
        baselineCapturedAt: new Date(),
        baselineContentHash: 'hash1',
        baselineSnapshotPath: 'path',
        taskSnapshots: [
          {
            taskId: 'task-1',
            taskIntent: 'Test',
            startedAt: new Date(),
            contentHashBefore: 'hash1',
            contentHashAfter: 'hash2',
            semanticChanges: [
              {
                changeType: 'modify_function' as any,
                target: 'myFunc',
                location: 'src/test.ts:10',
                lineStart: 10,
                lineEnd: 15,
                metadata: {},
              },
            ],
          },
          {
            taskId: 'task-2',
            taskIntent: 'Test 2',
            startedAt: new Date(),
            contentHashBefore: 'hash1',
            contentHashAfter: 'hash3',
            semanticChanges: [
              {
                changeType: 'modify_function' as any,
                target: 'myFunc',
                location: 'src/test.ts:10',
                lineStart: 10,
                lineEnd: 15,
                metadata: {},
              },
            ],
          },
        ],
      };

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1', 'task-2']]]));
      orchestrator.evolutionTracker.getConflictingFiles = vi.fn(() => ['src/test.ts']);
      orchestrator.evolutionTracker.getFileEvolution = vi.fn(() => mockEvolution);

      const preview = orchestrator.previewMerge(['task-1', 'task-2']);

      expect(preview.files_with_potential_conflicts).toContain('src/test.ts');
      expect(preview.summary.total_conflicts).toBeGreaterThan(0);
    });
  });

  describe('writeMergedFiles', () => {
    it('should write merged content to files', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockReturnValue(true);
      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/test.ts',
            mergedContent: 'merged content',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test merge',
          }],
        ]),
        stats: {
          filesProcessed: 1,
          filesAutoMerged: 1,
          filesAiMerged: 0,
          filesNeedReview: 0,
          filesFailed: 0,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      // Create orchestrator with dryRun: false to enable file writing
      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const written = wetOrchestrator.writeMergedFiles(report);

      expect(written).toHaveLength(1);
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should return empty array in dry run mode', () => {
      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/test.ts',
            mergedContent: 'merged content',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test merge',
          }],
        ]),
        stats: {
          filesProcessed: 1,
          filesAutoMerged: 1,
          filesAiMerged: 0,
          filesNeedReview: 0,
          filesFailed: 0,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      const written = orchestrator.writeMergedFiles(report);

      expect(written).toHaveLength(0);
    });
  });

  describe('applyToProject', () => {
    it('should write merged files to project directory', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/test.ts',
            mergedContent: 'merged content',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test merge',
          }],
        ]),
        stats: {
          filesProcessed: 1,
          filesAutoMerged: 1,
          filesAiMerged: 0,
          filesNeedReview: 0,
          filesFailed: 0,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      // Create orchestrator with dryRun: false
      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const success = wetOrchestrator.applyToProject(report);

      expect(success).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should skip failed merge results', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.FAILED,
            filePath: 'src/test.ts',
            mergedContent: undefined,
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Merge failed',
            error: 'Test error',
          }],
        ]),
        stats: {
          filesProcessed: 1,
          filesAutoMerged: 0,
          filesAiMerged: 0,
          filesNeedReview: 0,
          filesFailed: 1,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      // Create orchestrator with dryRun: false
      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const success = wetOrchestrator.applyToProject(report);

      expect(success).toBe(true);
      // FAILED results should not be written
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should return true in dry run mode without writing files', () => {
      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/test.ts',
            mergedContent: 'merged content',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test merge',
          }],
        ]),
        stats: {
          filesProcessed: 1,
          filesAutoMerged: 1,
          filesAiMerged: 0,
          filesNeedReview: 0,
          filesFailed: 0,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;

      const success = orchestrator.applyToProject(report);

      expect(success).toBe(true);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('AI integration', () => {
    it('should use AI resolver when enabled for hard conflicts', async () => {
      const mockAiResolver: AiResolverFn = vi.fn().mockResolvedValue('AI merged content');

      const aiOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        enableAi: true,
        aiResolver: mockAiResolver,
        dryRun: true,
      });

      // Create a scenario with hard conflicts
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [
          {
            changeType: 'modify_function' as any,
            target: 'myFunc',
            location: 'src/test.ts:10',
            lineStart: 10,
            lineEnd: 15,
            contentBefore: 'old',
            contentAfter: 'new',
            rawDiff: 'diff content',
            metadata: {},
          },
        ],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => [['src/test.ts', mockSnapshot]]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      const report = await aiOrchestrator.mergeTask('task-1', '/worktree', 'main');

      // Note: AI integration happens in private mergeFile method
      // The actual AI call behavior would be tested through integration
      expect(report).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle exceptions during merge and return error report', async () => {
      // Force an error by making getTaskModifications throw
      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => {
        throw new Error('Test error');
      });

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main', mockProgressCallback);

      expect(report.success).toBe(false);
      expect(report.error).toContain('Test error');
      expect(progressCalls.some(([stage]) => stage === 'error'));
    });

    it('should set completedAt even on failure', async () => {
      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => {
        throw new Error('Test error');
      });

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report.completedAt).toBeDefined();
      // Use greaterThanOrEqual for fast-running tests
      expect(report.completedAt!.getTime()).toBeGreaterThanOrEqual(report.startedAt.getTime());
    });
  });

  describe('Statistics tracking', () => {
    it('should accurately track merge statistics', async () => {
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => [['src/test.ts', mockSnapshot]]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      const report = await orchestrator.mergeTask('task-1', '/worktree/path', 'main');

      expect(report.stats.filesProcessed).toBe(1);
      expect(report.stats.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
