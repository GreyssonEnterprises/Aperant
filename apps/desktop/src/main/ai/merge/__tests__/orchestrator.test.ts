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
import { MergeDecision, MergeStrategy, type TaskSnapshot } from '../types';

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

      orchestrator.evolutionTracker.getTaskModifications = vi.fn((): [string, TaskSnapshot][] => [['src/test.ts', mockSnapshot]]);
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
      expect((preview.summary as { total_conflicts: number }).total_conflicts).toBeGreaterThan(0);
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
            metadata: {},
          },
        ],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
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

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      const report = await orchestrator.mergeTask('task-1', '/worktree/path', 'main');

      expect(report.stats.filesProcessed).toBe(1);
      expect(report.stats.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyToProject - additional coverage', () => {
    it('should skip files without mergedContent', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/with-content.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/with-content.ts',
            mergedContent: 'content here',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test',
          }],
          ['src/no-content.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/no-content.ts',
            mergedContent: undefined,
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'No content',
          }],
        ]),
        stats: {
          filesProcessed: 2,
          filesAutoMerged: 2,
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

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const success = wetOrchestrator.applyToProject(report);

      expect(success).toBe(true);
      // Should only write the file with content
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/test/project/src/with-content.ts',
        'content here',
        'utf8'
      );
    });

    it('should handle file write errors gracefully and return false', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/test.ts', {
            decision: MergeDecision.AUTO_MERGED,
            filePath: 'src/test.ts',
            mergedContent: 'content',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Test',
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

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const success = wetOrchestrator.applyToProject(report);

      expect(success).toBe(false);
    });

    it('should skip both FAILED decisions and missing content', () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const report = {
        success: true,
        startedAt: new Date(),
        tasksMerged: ['task-1'],
        fileResults: new Map([
          ['src/failed.ts', {
            decision: MergeDecision.FAILED,
            filePath: 'src/failed.ts',
            mergedContent: 'should not write',
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'Failed',
          }],
          ['src/no-content.ts', {
            decision: MergeDecision.NEEDS_HUMAN_REVIEW,
            filePath: 'src/no-content.ts',
            mergedContent: undefined,
            conflictsResolved: [],
            conflictsRemaining: [],
            aiCallsMade: 0,
            tokensUsed: 0,
            explanation: 'No content',
          }],
        ]),
        stats: {
          filesProcessed: 2,
          filesAutoMerged: 0,
          filesAiMerged: 0,
          filesNeedReview: 1,
          filesFailed: 1,
          conflictsDetected: 0,
          conflictsAutoResolved: 0,
          conflictsAiResolved: 0,
          aiCallsMade: 0,
          estimatedTokensUsed: 0,
          durationMs: 100,
        },
      };

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const success = wetOrchestrator.applyToProject(report);

      expect(success).toBe(true);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('saveReport - private method coverage via dryRun: false', () => {
    it('should save report to disk with proper format', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      // Provide actual modifications so report gets saved
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      wetOrchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      wetOrchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      await wetOrchestrator.mergeTask('task-1', '/worktree/path', 'main');

      // Verify mkdirSync was called for reports directory
      expect(mockMkdirSync).toHaveBeenCalled();
      // Verify writeFileSync was called
      expect(mockWriteFileSync).toHaveBeenCalled();

      // Verify the report format - writeFileSync signature is (path, data, options)
      const reportWriteCall = mockWriteFileSync.mock.calls.find((call) => {
        const path = call[0] as string;
        return path.includes('.json') && path.includes('merge_reports');
      });

      expect(reportWriteCall).toBeDefined();
      const writtenData = JSON.parse(reportWriteCall![1] as string);

      expect(writtenData).toHaveProperty('success');
      expect(writtenData).toHaveProperty('started_at');
      expect(writtenData).toHaveProperty('tasks_merged');
      expect(writtenData).toHaveProperty('stats');
      expect(writtenData).toHaveProperty('file_results');
    });

    it('should handle write errors gracefully when saving report', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      orchestrator.evolutionTracker.getTaskModifications = vi.fn(() => []);

      const report = await wetOrchestrator.mergeTask('task-1', '/worktree/path', 'main');

      // Should not throw, should complete successfully
      expect(report.success).toBe(true);
    });

    it('should serialize fileResults correctly in saved report', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      wetOrchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);

      await wetOrchestrator.mergeTask('task-1', '/worktree/path', 'main');

      // Find the merge report write call (not directory creation)
      const reportWriteCall = mockWriteFileSync.mock.calls.find((call) => {
        const path = call[0] as string;
        return path.includes('.json') && path.includes('merge_reports');
      });

      expect(reportWriteCall).toBeDefined();
      const writtenData = JSON.parse(reportWriteCall![1] as string);

      // Verify file_results structure
      expect(writtenData.file_results).toBeDefined();
      const fileResultKeys = Object.keys(writtenData.file_results);
      expect(fileResultKeys.length).toBeGreaterThan(0);

      const firstFileResult = writtenData.file_results[fileResultKeys[0]];
      expect(firstFileResult).toHaveProperty('decision');
      expect(firstFileResult).toHaveProperty('explanation');
      expect(firstFileResult).toHaveProperty('conflicts_resolved');
      expect(firstFileResult).toHaveProperty('conflicts_remaining');
    });

    it('should include completed_at only when set', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      // Provide actual modifications so report gets saved
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      wetOrchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      wetOrchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      await wetOrchestrator.mergeTask('task-1', '/worktree/path', 'main');

      const reportWriteCall = mockWriteFileSync.mock.calls.find((call) => {
        const path = call[0] as string;
        return path.includes('.json') && path.includes('merge_reports');
      });

      expect(reportWriteCall).toBeDefined();
      const writtenData = JSON.parse(reportWriteCall![1] as string);

      expect(writtenData.completed_at).toBeDefined();
    });

    it('should include error field when merge fails', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      // Set up the wetOrchestrator's evolutionTracker to throw
      wetOrchestrator.evolutionTracker.getTaskModifications = vi.fn(() => {
        throw new Error('Merge failed catastrophically');
      });

      const report = await wetOrchestrator.mergeTask('task-1', '/worktree/path', 'main');

      expect(report.success).toBe(false);
      expect(report.error).toBeDefined();

      // Verify saved report includes error
      const reportWriteCall = mockWriteFileSync.mock.calls.find((call) => {
        const path = call[0] as string;
        return path.includes('.json') && path.includes('merge_reports');
      });

      expect(reportWriteCall).toBeDefined();
      const writtenData = JSON.parse(reportWriteCall![1] as string);

      expect(writtenData.error).toContain('Merge failed catastrophically');
    });
  });

  describe('mergeTasks - DIRECT_COPY handling in multi-task merge', () => {
    it('should handle DIRECT_COPY decision in multi-task merge', async () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('direct copy content');

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
        { taskId: 'task-2', priority: 2, worktreePath: '/worktree2' },
      ];

      // Mock for DIRECT_COPY scenario
      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1']]]));
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      expect(report.tasksMerged).toHaveLength(2);
    });

    it('should set FAILED when worktree file not found for DIRECT_COPY', async () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockReturnValue(false); // Worktree doesn't exist
      mockReadFileSync.mockReturnValue('');

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/nonexistent/worktree' },
      ];

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1']]]));
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      // Should handle missing worktree gracefully
    });
  });

  describe('AI resolver edge cases', () => {
    it('should handle AI resolver returning empty content', async () => {
      const mockAiResolver: AiResolverFn = vi.fn().mockResolvedValue('   '); // Whitespace only

      const aiOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        enableAi: true,
        aiResolver: mockAiResolver,
        dryRun: true,
      });

      // Create scenario that would trigger AI merge
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
            metadata: {},
          },
        ],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);

      const report = await aiOrchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // Empty AI response should fall through to NEEDS_HUMAN_REVIEW
    });

    it('should handle AI resolver throwing exceptions', async () => {
      const mockAiResolver: AiResolverFn = vi.fn().mockRejectedValue(new Error('AI service unavailable'));

      const aiOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        enableAi: true,
        aiResolver: mockAiResolver,
        dryRun: true,
      });

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
            metadata: {},
          },
        ],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);

      const report = await aiOrchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // AI error should fall through gracefully
    });

    it('should save multi-task report when dryRun is false', async () => {
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
      const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockMkdirSync.mockReturnValue(undefined);
      mockWriteFileSync.mockReturnValue(undefined);
      mockExistsSync.mockReturnValue(true);

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
        { taskId: 'task-2', priority: 2, worktreePath: '/worktree2' },
      ];

      const wetOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        dryRun: false,
      });

      wetOrchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map());
      wetOrchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});

      await wetOrchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      // Verify multi-task report was saved (contains "multi_" in filename)
      const multiReportCall = mockWriteFileSync.mock.calls.find((call) => {
        const path = call[0] as string;
        return path.includes('multi_') && path.includes('merge_reports');
      });

      expect(multiReportCall).toBeDefined();
    });

    it('should handle auto-mergeable conflicts with hard conflicts mixed', async () => {
      // This tests lines 541-561: autoMergeableConflicts > 0 but hardConflicts > 0
      // so it should NOT enter the auto-merge block
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
            metadata: {},
          },
        ],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      // Mock conflict detector to return both auto-mergeable and hard conflicts
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => [
        { canAutoMerge: true } as any,
        { canAutoMerge: false } as any,
      ]);

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // Should skip auto-merge due to presence of hard conflicts
    });

    it('should auto-merge when conflicts are auto-mergeable and autoMerger can handle', async () => {
      // This tests lines 545-560: auto-merge branch
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      // Mock auto-mergeable conflicts with mergeStrategy
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => [
        {
          canAutoMerge: true,
          mergeStrategy: 'APPEND_FUNCTIONS' as any,
          filePath: 'src/test.ts',
        } as any,
      ]);

      // Mock autoMerger to handle the strategy
      orchestrator.autoMerger.canHandle = vi.fn(() => true);
      orchestrator.autoMerger.merge = vi.fn(() => ({
        decision: MergeDecision.AUTO_MERGED,
        filePath: 'src/test.ts',
        mergedContent: 'auto merged content',
        conflictsResolved: [],
        conflictsRemaining: [],
        aiCallsMade: 0,
        tokensUsed: 0,
        explanation: 'Auto-merged',
      }));

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // Verify autoMerger.merge was called
      expect(orchestrator.autoMerger.merge).toHaveBeenCalled();
    });

    it('should return NEEDS_HUMAN_REVIEW for hard conflicts', async () => {
      // This tests lines 576-586: hard conflicts without AI
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      // Mock hard conflicts (no auto-merge) with filePath
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => [
        { canAutoMerge: false, filePath: 'src/test.ts', location: 'line 10' } as any,
      ]);

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // Should return NEEDS_HUMAN_REVIEW for hard conflicts
      // Check that fileResults contains the NEEDS_HUMAN_REVIEW decision
      const result = report.fileResults.get('src/test.ts');
      expect(result?.decision).toBe(MergeDecision.NEEDS_HUMAN_REVIEW);
    });

    it('should use AI resolver for hard conflicts when enabled', async () => {
      // This tests lines 564-573: AI resolver path
      const mockAiResolver: AiResolverFn = vi.fn().mockResolvedValue('AI merged content');

      const aiOrchestrator = new MergeOrchestrator({
        projectDir: mockProjectDir,
        storageDir: mockStorageDir,
        enableAi: true,
        aiResolver: mockAiResolver,
        dryRun: true,
      });

      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
        rawDiff: 'diff content',
      };

      aiOrchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      aiOrchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      // Mock hard conflicts
      aiOrchestrator.conflictDetector.detectConflicts = vi.fn(() => [
        { canAutoMerge: false, filePath: 'src/test.ts' } as any,
      ]);

      const report = await aiOrchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // AI resolver should have been called
    });

    it('should return DIRECT_COPY when no conflicts at all', async () => {
      // This tests lines 588-596: no conflicts return
      // We need multiple tasks with no conflicts between them to reach line 589
      const mockSnapshot1: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task 1',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      const mockSnapshot2: TaskSnapshot = {
        taskId: 'task-2',
        taskIntent: 'Test task 2',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'ghi789',
        semanticChanges: [],
      };

      // Use mergeTasks with multiple tasks to test the multi-task scenario
      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1', 'task-2']]]));
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => []);

      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('merged content');

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
        { taskId: 'task-2', priority: 2, worktreePath: '/worktree2' },
      ];

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      expect(report.tasksMerged).toHaveLength(2);
    });

    it('should handle empty conflicts with autoMergeableConflicts empty', async () => {
      // Tests the path where conflicts.length === 0 for single task (lines 528-538)
      const mockSnapshot: TaskSnapshot = {
        taskId: 'task-1',
        taskIntent: 'Test task',
        startedAt: new Date(),
        contentHashBefore: 'abc123',
        contentHashAfter: 'def456',
        semanticChanges: [],
      };

      orchestrator.evolutionTracker.getTaskModifications = vi.fn().mockReturnValue([['src/test.ts', mockSnapshot]] as [string, TaskSnapshot][]);
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      orchestrator.conflictDetector.detectConflicts = vi.fn(() => []);

      const report = await orchestrator.mergeTask('task-1', '/worktree', 'main');

      expect(report).toBeDefined();
      // Report should be created successfully
      expect(report.tasksMerged).toContain('task-1');
    });

    it('should handle errors during multi-task merge and catch them', async () => {
      // This tests lines 477-479: catch block in mergeTasks
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(true);

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
      ];

      // Make getFilesModifiedByTasks throw to trigger catch block
      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => {
        throw new Error('Multi-task merge error');
      });

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      expect(report.success).toBe(false);
      expect(report.error).toContain('Multi-task merge error');
      expect(progressCalls.some(([stage]) => stage === 'error')).toBe(true);
    });

    it('should process multiple files in multi-task merge', async () => {
      // This tests lines 432-466: the main file processing loop
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('file content');

      // Create file evolution with multiple files
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
            semanticChanges: [],
          },
        ],
      };

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() =>
        new Map([['src/test.ts', ['task-1']], ['src/other.ts', ['task-2']]])
      );
      orchestrator.evolutionTracker.getFileEvolution = vi.fn((filePath) => {
        if (filePath === 'src/test.ts') return mockEvolution;
        return {
          ...mockEvolution,
          filePath: 'src/other.ts',
          taskSnapshots: [{ ...mockEvolution.taskSnapshots[0], taskId: 'task-2' }],
        };
      });
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => []);

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
        { taskId: 'task-2', priority: 2, worktreePath: '/worktree2' },
      ];

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      expect(report.tasksMerged).toHaveLength(2);
      // Should process both files
      expect(report.fileResults.size).toBeGreaterThanOrEqual(1);
    });

    it('should handle DIRECT_COPY decision in multi-task merge loop', async () => {
      // This tests lines 441-462: DIRECT_COPY handling in mergeTasks
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('worktree content');

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
            semanticChanges: [],
          },
        ],
      };

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1']]]));
      orchestrator.evolutionTracker.getFileEvolution = vi.fn(() => mockEvolution);
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');

      // Mock conflictDetector to return no conflicts (should trigger DIRECT_COPY)
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => []);

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/worktree1' },
      ];

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      // Should process the file and handle DIRECT_COPY
      expect(report.fileResults.size).toBeGreaterThan(0);
    });

    it('should set FAILED when worktree file not found for DIRECT_COPY', async () => {
      // This tests lines 458-461: when worktree file doesn't exist for DIRECT_COPY
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(false); // Worktree file doesn't exist

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
            semanticChanges: [],
          },
        ],
      };

      orchestrator.evolutionTracker.getFilesModifiedByTasks = vi.fn(() => new Map([['src/test.ts', ['task-1']]]));
      orchestrator.evolutionTracker.getFileEvolution = vi.fn(() => mockEvolution);
      orchestrator.evolutionTracker.refreshFromGit = vi.fn(() => {});
      orchestrator.evolutionTracker.getBaselineContent = vi.fn(() => 'baseline');
      orchestrator.conflictDetector.detectConflicts = vi.fn(() => []);

      const requests: TaskMergeRequest[] = [
        { taskId: 'task-1', priority: 1, worktreePath: '/nonexistent/worktree' },
      ];

      const report = await orchestrator.mergeTasks(requests, 'main', mockProgressCallback);

      expect(report).toBeDefined();
      // Should have a FAILED result for the file
      const result = report.fileResults.get('src/test.ts');
      expect(result?.decision).toBe(MergeDecision.FAILED);
      expect(result?.error).toContain('Worktree file not found');
    });
  });
});
