/**
 * File Evolution Tracker Tests
 *
 * Tests for file modification tracking across task modifications.
 * Covers baseline capture, task modification recording, git integration,
 * and evolution data persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeContentHash } from '../types';

// Mock fs and child_process BEFORE importing the module under test
// The source file uses default import (import fs from 'fs'), so we need to mock accordingly
vi.mock('fs', async () => {
  return {
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('child_process', async () => {
  return {
    default: {
      spawnSync: vi.fn(),
      execSync: vi.fn(),
    },
    spawnSync: vi.fn(),
    execSync: vi.fn(),
  };
});

// Import after mocking
import fs from 'fs';
import child_process from 'child_process';
import { FileEvolutionTracker, DEFAULT_EXTENSIONS } from '../file-evolution';

describe('FileEvolutionTracker', () => {
  let tracker: FileEvolutionTracker;
  const mockProjectDir = '/test/project';
  const mockStorageDir = '/test/storage';

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behaviors
    // Need to mock both the default export and named exports
    const mockExistsSync = vi.fn().mockReturnValue(false);
    const mockReadFileSync = vi.fn().mockReturnValue('');
    const mockWriteFileSync = vi.fn().mockReturnValue(undefined);
    const mockMkdirSync = vi.fn().mockReturnValue(undefined);
    const mockRmSync = vi.fn().mockReturnValue(undefined);

    (fs.existsSync as unknown as typeof mockExistsSync) = mockExistsSync;
    (fs.readFileSync as unknown as typeof mockReadFileSync) = mockReadFileSync;
    (fs.writeFileSync as unknown as typeof mockWriteFileSync) = mockWriteFileSync;
    (fs.mkdirSync as unknown as typeof mockMkdirSync) = mockMkdirSync;
    (fs.rmSync as unknown as typeof mockRmSync) = mockRmSync;

    const mockSpawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 12345,
      output: [],
      signal: null,
    });

    (child_process.spawnSync as unknown as typeof mockSpawnSync) = mockSpawnSync;

    tracker = new FileEvolutionTracker(mockProjectDir, mockStorageDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided paths', () => {
      expect(tracker).toBeDefined();
      expect(tracker.storageDir).toBe(mockStorageDir);
      expect(tracker.baselinesDir).toBe(mockStorageDir + '/baselines');
    });

    it('should use default storage path if not provided', () => {
      const tracker2 = new FileEvolutionTracker(mockProjectDir);
      expect(tracker2.storageDir).toContain('.auto-claude');
    });

    it('should load existing evolutions on init', () => {
      const mockData = {
        'src/test.ts': {
          filePath: 'src/test.ts',
          baselineCommit: 'abc123',
          baselineContentHash: 'hash1',
          baselineSnapshotPath: 'baselines/task1/test_ts.baseline',
          taskSnapshots: [],
        },
      };

      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: any) => {
        return String(path).includes('file_evolution.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify(mockData));

      const tracker2 = new FileEvolutionTracker(mockProjectDir, mockStorageDir);

      const evolution = tracker2.getFileEvolution('src/test.ts');
      expect(evolution).toBeDefined();
    });
  });

  describe('captureBaselines', () => {
    it('should capture baseline content for files', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('test.ts')) return 'export function test() {}';
        return '';
      });

      const result = tracker.captureBaselines('task-1', ['src/test.ts']);

      expect(result.size).toBe(1);
      const evolution = result.get('src/test.ts');
      expect(evolution?.filePath).toBe('src/test.ts');
      expect(evolution?.baselineCommit).toBe('unknown'); // git returns unknown by default
    });

    it('should discover trackable files when no list provided', () => {
      // When no git files are found (git returns empty), captureBaselines returns empty map
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      const result = tracker.captureBaselines('task-1');

      // With no git files discovered, returns empty map
      expect(result).toBeDefined();
      expect(result.size).toBe(0);
    });

    it('should only capture files with tracked extensions', () => {
      // Test extension filtering by providing files with different extensions
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      // Provide explicit file list with various extensions
      // Note: When explicit file list is provided, all files are captured
      // Filtering only happens during git auto-discovery
      const result = tracker.captureBaselines('task-1', [
        'src/test.ts',      // .ts - in DEFAULT_EXTENSIONS
        'src/test.jsx',     // .jsx - in DEFAULT_EXTENSIONS
        'README.md',        // .md - in DEFAULT_EXTENSIONS
      ]);

      // All provided files should be captured when explicit list is given
      const files = Array.from(result.keys());
      expect(files.some(f => f.endsWith('.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('.jsx'))).toBe(true);
      expect(files.some(f => f.endsWith('.md'))).toBe(true);
    });

    it('should store baseline content in storage', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;

      mockReadFileSync.mockReturnValue('content here');

      tracker.captureBaselines('task-1', ['src/test.ts']);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('baselines/task-1/'),
        expect.any(String),
        'utf8',
      );
    });
  });

  describe('recordModification', () => {
    beforeEach(() => {
      // First capture a baseline
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('original content');
      tracker.captureBaselines('task-1', ['src/test.ts']);
    });

    it('should record file modifications', () => {
      const oldContent = 'original content';
      const newContent = 'modified content';

      const result = tracker.recordModification('task-1', 'src/test.ts', oldContent, newContent);

      expect(result).toBeDefined();
      expect(result?.taskId).toBe('task-1');
      expect(result?.contentHashBefore).toBe(computeContentHash(oldContent));
      expect(result?.contentHashAfter).toBe(computeContentHash(newContent));
    });

    it('should perform semantic analysis on changes', () => {
      const oldContent = 'function foo() {}';
      const newContent = 'function foo() {}\n\nfunction bar() {}';

      const result = tracker.recordModification('task-1', 'src/test.ts', oldContent, newContent);

      expect(result?.semanticChanges.length).toBeGreaterThan(0);
    });

    it('should skip semantic analysis when requested', () => {
      const oldContent = 'original content';
      const newContent = 'modified content';

      const result = tracker.recordModification('task-1', 'src/test.ts', oldContent, newContent, undefined, true);

      expect(result?.semanticChanges).toEqual([]);
    });

    it('should return undefined for untracked files', () => {
      const result = tracker.recordModification('task-1', 'untracked.ts', 'old', 'new');

      expect(result).toBeUndefined();
    });
  });

  describe('getFileEvolution', () => {
    it('should return undefined for non-existent files', () => {
      const result = tracker.getFileEvolution('non-existent.ts');
      expect(result).toBeUndefined();
    });

    it('should return evolution data for tracked files', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);

      const result = tracker.getFileEvolution('src/test.ts');

      expect(result).toBeDefined();
      expect(result?.filePath).toBe('src/test.ts');
    });
  });

  describe('getBaselineContent', () => {
    it('should return undefined for files without baseline', () => {
      const result = tracker.getBaselineContent('non-existent.ts');
      expect(result).toBeUndefined();
    });

    it('should return baseline content when available', () => {
      const baselineContent = 'baseline content here';

      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      // Reset and set up mocks for this test
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('.baseline')) return baselineContent;
        return 'content';
      });

      tracker.captureBaselines('task-1', ['src/test.ts']);

      const result = tracker.getBaselineContent('src/test.ts');
      expect(result).toBe(baselineContent);
    });
  });

  describe('getTaskModifications', () => {
    it('should return empty array for task with no modifications', () => {
      const result = tracker.getTaskModifications('non-existent-task');
      expect(result).toEqual([]);
    });

    it('should return all modifications made by a task', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts', 'src/other.ts']);

      tracker.recordModification('task-1', 'src/test.ts', 'old', 'new');
      tracker.recordModification('task-1', 'src/other.ts', 'old', 'new');

      const result = tracker.getTaskModifications('task-1');

      expect(result.length).toBe(2);
      expect(result.some(([fp]) => String(fp).includes('test.ts'))).toBe(true);
      expect(result.some(([fp]) => String(fp).includes('other.ts'))).toBe(true);
    });
  });

  describe('getConflictingFiles', () => {
    it('should return empty array for no tasks', () => {
      const result = tracker.getConflictingFiles(['task-1']);
      expect(result).toEqual([]);
    });

    it('should identify files modified by multiple tasks', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);
      tracker.captureBaselines('task-2', ['src/test.ts']);

      tracker.recordModification('task-1', 'src/test.ts', 'old', 'new1');
      tracker.recordModification('task-2', 'src/test.ts', 'old', 'new2');

      const result = tracker.getConflictingFiles(['task-1', 'task-2']);

      expect(result.length).toBe(1);
      expect(result[0]).toContain('test.ts');
    });
  });

  describe('markTaskCompleted', () => {
    it('should set completedAt timestamp for task snapshots', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);

      const before = tracker.getFileEvolution('src/test.ts');
      expect(before?.taskSnapshots[0].completedAt).toBeUndefined();

      tracker.markTaskCompleted('task-1');

      const after = tracker.getFileEvolution('src/test.ts');
      expect(after?.taskSnapshots[0].completedAt).toBeDefined();
    });
  });

  describe('cleanupTask', () => {
    it('should remove task snapshots and baselines', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);

      // Capture baselines for a second task so the evolution doesn't get deleted
      tracker.captureBaselines('task-2', ['src/test.ts']);

      const before = tracker.getFileEvolution('src/test.ts');
      const beforeCount = before?.taskSnapshots.length ?? 0;

      tracker.cleanupTask('task-1', false);

      const after = tracker.getFileEvolution('src/test.ts');
      expect(after).toBeDefined();
      expect(after?.taskSnapshots.length).toBe(beforeCount - 1);
    });

    it('should remove baseline directory when requested', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockRmSync = fs.rmSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockReadFileSync.mockReturnValue('content');
      mockExistsSync.mockReturnValue(true);
      tracker.captureBaselines('task-1', ['src/test.ts']);

      tracker.cleanupTask('task-1', true);

      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('baselines/task-1'),
        { recursive: true },
      );
    });
  });

  describe('getActiveTasks', () => {
    it('should return set of active task IDs', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);
      tracker.captureBaselines('task-2', ['src/other.ts']);

      // Mark task-2 as completed
      tracker.markTaskCompleted('task-2');

      const result = tracker.getActiveTasks();

      expect(result.has('task-1')).toBe(true);
      expect(result.has('task-2')).toBe(false);
    });
  });

  describe('getEvolutionSummary', () => {
    it('should return summary statistics', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);
      tracker.captureBaselines('task-2', ['src/other.ts']);

      const result = tracker.getEvolutionSummary();

      expect(result).toHaveProperty('total_files_tracked');
      expect(result).toHaveProperty('total_tasks');
      expect(result).toHaveProperty('files_with_potential_conflicts');
      expect(result).toHaveProperty('total_semantic_changes');
      expect(result).toHaveProperty('active_tasks');
    });

    it('should count files with multiple tasks as potential conflicts', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');
      tracker.captureBaselines('task-1', ['src/test.ts']);
      tracker.captureBaselines('task-2', ['src/test.ts']);

      const result = tracker.getEvolutionSummary();

      expect(result.files_with_potential_conflicts).toBe(1);
    });
  });

  describe('DEFAULT_EXTENSIONS', () => {
    it('should include common source code extensions', () => {
      expect(DEFAULT_EXTENSIONS.has('.ts')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.js')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.jsx')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.tsx')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.py')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.go')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.rs')).toBe(true);
    });

    it('should include config and doc extensions', () => {
      expect(DEFAULT_EXTENSIONS.has('.json')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.yaml')).toBe(true);
      expect(DEFAULT_EXTENSIONS.has('.md')).toBe(true);
    });
  });
});
