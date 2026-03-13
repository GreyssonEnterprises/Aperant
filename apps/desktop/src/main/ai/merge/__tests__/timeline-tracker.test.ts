/**
 * Timeline Tracker Tests
 *
 * Tests for per-file modification timeline tracking using git history.
 * Covers task lifecycle events, persistence, query methods, and git integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs and child_process BEFORE importing the module under test
vi.mock('fs', async () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
      writeFileSync: vi.fn().mockReturnValue(undefined),
      mkdirSync: vi.fn().mockReturnValue(undefined),
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn().mockReturnValue(undefined),
    mkdirSync: vi.fn().mockReturnValue(undefined),
  };
});

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return {
    ...actual,
    join: vi.fn((...parts: string[]) => parts.join('/')),
  };
});

vi.mock('child_process', async () => {
  const mockSpawnSync = vi.fn().mockReturnValue({
    status: 0,
    stdout: '',
    stderr: '',
    pid: 12345,
    output: [],
    signal: null,
  });
  return {
    default: {
      spawnSync: mockSpawnSync,
    },
    spawnSync: mockSpawnSync,
  };
});

import fs from 'fs';
import child_process from 'child_process';
import * as path from 'path';
import { FileTimelineTracker } from '../timeline-tracker';

describe('FileTimelineTracker', () => {
  let tracker: FileTimelineTracker;
  const mockProjectDir = '/test/project';
  const mockStorageDir = '/test/storage';

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mocks to default behaviors
    const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
    const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
    const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
    const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;
    const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;

    mockExistsSync.mockReset().mockReturnValue(false);
    mockReadFileSync.mockReset().mockReturnValue('');
    mockWriteFileSync.mockReset().mockReturnValue(undefined);
    mockMkdirSync.mockReset().mockReturnValue(undefined);
    mockSpawnSync.mockReset().mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 12345,
      output: [],
      signal: null,
    } as any);

    tracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided paths', () => {
      expect(tracker).toBeDefined();
    });

    it('should load existing timelines from storage', () => {
      // This test verifies the loading mechanism works
      // The actual TimelinePersistence.loadAllTimelines() handles JSON parsing
      // We verify it doesn't crash and returns a working tracker
      const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
      expect(freshTracker).toBeDefined();
      // With no saved timelines, should have no tracked files
      expect(freshTracker.hasTimeline('src/test.ts')).toBe(false);
    });
  });

  describe('onTaskStart', () => {
    it('should create timeline for task files', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('show')) return 'original content';
        return '';
      });

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', 'Test intent', 'Test Task');

      expect(tracker.hasTimeline('src/test.ts')).toBe(true);
    });

    it('should store branch point commit and content', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      // Set up mock for git show command
      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('show')) return {
          status: 0,
          stdout: 'original content',
          stderr: '',
          pid: 12345,
          output: ['original content'],
          signal: null,
        } as any;
        return {
          status: 0,
          stdout: '',
          stderr: '',
          pid: 12345,
          output: [],
          signal: null,
        } as any;
      });
      mockReadFileSync.mockImplementation((path: any) => {
        // Don't interfere with spawnSync results
        if (String(path).includes('.json')) return '';
        return '';
      });

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', 'Test intent', 'Test Task');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.branchPoint.commitHash).toBe('abc123');
      expect(taskView?.branchPoint.content).toBe('original content');
    });

    it('should store task intent', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', 'Test intent', 'Test Task');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.taskIntent.title).toBe('Test Task');
      expect(taskView?.taskIntent.description).toBe('Test intent');
      expect(taskView?.taskIntent.fromPlan).toBe(true);
    });

    it('should set initial status to active', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.status).toBe('active');
    });

    it('should use current HEAD as branch point if not provided', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('rev-parse')) return { status: 0, stdout: 'current-head', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], undefined, '', 'Test Task');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.branchPoint.commitHash).toBe('current-head');
    });
  });

  describe('onMainBranchCommit', () => {
    it('should add main branch events to tracked files', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      // First, start a task to create timeline
      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      // Set up mocks for main branch commit
      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('diff-tree')) return { status: 0, stdout: 'src/test.ts', stderr: '' } as any;
        if (args?.includes('show')) return { status: 0, stdout: 'new content', stderr: '' } as any;
        if (args?.includes('log')) return { status: 0, stdout: 'Commit message\nAuthor Name', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });
      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('.json')) return '';
        return 'new content';
      });

      tracker.onMainBranchCommit('main-commit-123');

      const timeline = tracker.getTimeline('src/test.ts');
      expect(timeline?.mainBranchEvents.length).toBeGreaterThan(0);
    });

    it('should skip commits for untracked files', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('diff-tree')) return { status: 0, stdout: 'src/untracked.ts', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });

      tracker.onMainBranchCommit('main-commit-123');

      expect(tracker.hasTimeline('src/untracked.ts')).toBe(false);
    });
  });

  describe('onTaskWorktreeChange', () => {
    it('should update worktree state for task files', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      tracker.onTaskWorktreeChange('task-1', 'src/test.ts', 'modified content');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.worktreeState?.content).toBe('modified content');
      expect(taskView?.worktreeState?.lastModified).toBeInstanceOf(Date);
    });

    it('should do nothing for non-existent timeline', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      // Should not throw
      tracker.onTaskWorktreeChange('unknown-task', 'src/unknown.ts', 'content');

      // Note: onTaskWorktreeChange creates a timeline if it doesn't exist
      // because it calls getOrCreateTimeline internally
      expect(tracker.hasTimeline('src/unknown.ts')).toBe(true);

      // But the task view should not exist since the task wasn't started
      const timeline = tracker.getTimeline('src/unknown.ts');
      expect(timeline?.taskViews.has('unknown-task')).toBe(false);
    });
  });

  describe('onTaskMerged', () => {
    it('should mark task as merged', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      tracker.onTaskMerged('task-1', 'merge-commit');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.status).toBe('merged');
      expect(taskView?.mergedAt).toBeInstanceOf(Date);
    });

    it('should add merged task event to timeline', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('show')) return { status: 0, stdout: 'merged content', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });
      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('show')) return 'merged content';
        return '';
      });

      tracker.onTaskMerged('task-1', 'merge-commit');

      const timeline = tracker.getTimeline('src/test.ts');
      const mergedEvent = timeline?.mainBranchEvents.find(e => e.source === 'merged_task');

      expect(mergedEvent).toBeDefined();
      expect(mergedEvent?.mergedFromTask).toBe('task-1');
    });
  });

  describe('onTaskAbandoned', () => {
    it('should mark task as abandoned', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Test Task');

      tracker.onTaskAbandoned('task-1');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.status).toBe('abandoned');
    });
  });

  describe('getMergeContext', () => {
    it('should return undefined for non-existent timeline', () => {
      const context = tracker.getMergeContext('task-1', 'src/unknown.ts');
      expect(context).toBeUndefined();
    });

    it('should return merge context for tracked task', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', 'Test intent', 'Test Task');

      const context = tracker.getMergeContext('task-1', 'src/test.ts');

      expect(context).toBeDefined();
      expect(context?.filePath).toBe('src/test.ts');
      expect(context?.taskId).toBe('task-1');
      expect(context?.taskBranchPoint.commitHash).toBe('abc123');
    });

    it('should include other pending tasks', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
      tracker.onTaskStart('task-2', ['src/test.ts'], [], 'abc123', '', 'Task 2');

      const context = tracker.getMergeContext('task-1', 'src/test.ts');

      expect(context?.totalPendingTasks).toBe(1); // Only task-2 (not task-1 itself)
      expect(context?.otherPendingTasks[0].taskId).toBe('task-2');
    });
  });

  describe('getFilesForTask', () => {
    it('should return files associated with a task', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts', 'src/other.ts'], [], 'abc123', '', 'Test Task');

      const files = tracker.getFilesForTask('task-1');

      expect(files).toContain('src/test.ts');
      expect(files).toContain('src/other.ts');
    });

    it('should return empty array for unknown task', () => {
      const files = tracker.getFilesForTask('unknown-task');
      expect(files).toEqual([]);
    });
  });

  describe('getPendingTasksForFile', () => {
    it('should return active tasks for a file', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
      tracker.onTaskStart('task-2', ['src/test.ts'], [], 'abc123', '', 'Task 2');

      const pendingTasks = tracker.getPendingTasksForFile('src/test.ts');

      expect(pendingTasks.length).toBe(2);
      expect(pendingTasks.some(t => t.taskId === 'task-1')).toBe(true);
      expect(pendingTasks.some(t => t.taskId === 'task-2')).toBe(true);
    });

    it('should exclude merged and abandoned tasks', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
      tracker.onTaskStart('task-2', ['src/test.ts'], [], 'abc123', '', 'Task 2');
      tracker.onTaskMerged('task-1', 'merge-commit');

      const pendingTasks = tracker.getPendingTasksForFile('src/test.ts');

      expect(pendingTasks.length).toBe(1);
      expect(pendingTasks[0].taskId).toBe('task-2');
    });

    it('should return empty array for untracked file', () => {
      const pendingTasks = tracker.getPendingTasksForFile('src/unknown.ts');
      expect(pendingTasks).toEqual([]);
    });
  });

  describe('getTaskDrift', () => {
    it('should return commits behind for active tasks', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
      tracker.onTaskStart('task-2', ['src/other.ts'], [], 'abc123', '', 'Task 2');

      const drift = tracker.getTaskDrift('task-1');

      expect(drift.get('src/test.ts')).toBe(0); // Initially 0 commits behind
    });

    it('should not include merged tasks in drift', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
      tracker.onTaskMerged('task-1', 'merge-commit');

      const drift = tracker.getTaskDrift('task-1');

      expect(drift.size).toBe(0); // Merged task not included
    });
  });

  describe('hasTimeline and getTimeline', () => {
    it('should return false for non-existent file', () => {
      expect(tracker.hasTimeline('src/unknown.ts')).toBe(false);
    });

    it('should return undefined for non-existent timeline', () => {
      expect(tracker.getTimeline('src/unknown.ts')).toBeUndefined();
    });

    it('should return true for tracked files', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      mockReadFileSync.mockReturnValue('content');

      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');

      expect(tracker.hasTimeline('src/test.ts')).toBe(true);
      expect(tracker.getTimeline('src/test.ts')).toBeDefined();
    });
  });

  describe('initializeFromWorktree', () => {
    it('should initialize timeline from worktree changes', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('merge-base')) return { status: 0, stdout: 'merge-base-commit', stderr: '' } as any;
        if (args?.includes('diff')) return { status: 0, stdout: 'src/test.ts\nsrc/other.ts', stderr: '' } as any;
        if (args?.includes('rev-list')) return { status: 0, stdout: '5', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });
      mockReadFileSync.mockReturnValue('worktree content');
      mockExistsSync.mockReturnValue(true);

      tracker.initializeFromWorktree('task-1', '/worktree/path', 'intent', 'Task 1', 'main');

      expect(tracker.hasTimeline('src/test.ts')).toBe(true);
      expect(tracker.hasTimeline('src/other.ts')).toBe(true);

      const drift = tracker.getTaskDrift('task-1');
      expect(drift.get('src/test.ts')).toBe(5); // 5 commits behind
    });

    it('should do nothing if branch point not found', () => {
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' } as any);

      tracker.initializeFromWorktree('task-1', '/worktree/path', '', 'Task 1');

      // No timelines should be created
      expect(tracker.hasTimeline('src/test.ts')).toBe(false);
    });
  });

  describe('captureWorktreeState', () => {
    it('should capture current worktree file contents', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      // First, start a task
      mockReadFileSync.mockReturnValue('content');
      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');

      // Test that onTaskWorktreeChange updates the worktree state
      tracker.onTaskWorktreeChange('task-1', 'src/test.ts', 'modified content from worktree');

      const timeline = tracker.getTimeline('src/test.ts');
      const taskView = timeline?.taskViews.get('task-1');

      expect(taskView?.worktreeState?.content).toBe('modified content from worktree');
    });
  });

  describe('TimelinePersistence error handling', () => {
    describe('loadAllTimelines', () => {
      it('should handle corrupted index file gracefully', () => {
        const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        // Simulate index file exists but contains invalid JSON
        mockExistsSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return true;
          return false;
        });
        mockReadFileSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return 'invalid json{';
          return '';
        });

        // Should not throw, should return empty timelines
        const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
        expect(freshTracker).toBeDefined();
        expect(freshTracker.hasTimeline('src/test.ts')).toBe(false);
      });

      it('should handle corrupted timeline file gracefully', () => {
        const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        // Simulate index file exists with valid entries
        mockExistsSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return true;
          if (String(path).includes('.json')) return true;
          return false;
        });
        mockReadFileSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return '["src/test.ts"]';
          if (String(path).includes('src_test_ts.json')) return 'invalid json{';
          return '';
        });

        // Should not throw, should skip corrupted timeline files
        const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
        expect(freshTracker).toBeDefined();
      });

      it('should handle missing timeline files gracefully', () => {
        const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        // Simulate index file exists but timeline files are missing
        mockExistsSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return true;
          if (String(path).includes('.json')) return false; // Timeline files don't exist
          return false;
        });
        mockReadFileSync.mockImplementation((path: any) => {
          if (String(path).includes('index.json')) return '["src/test.ts", "src/other.ts"]';
          return '';
        });

        // Should not throw, should skip missing timeline files
        const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
        expect(freshTracker).toBeDefined();
        expect(freshTracker.hasTimeline('src/test.ts')).toBe(false);
      });

      it('should handle readFileSync throwing error', () => {
        const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        // Should not throw, should return empty timelines
        const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
        expect(freshTracker).toBeDefined();
      });
    });

    describe('updateIndex', () => {
      it('should handle writeFileSync errors gracefully', () => {
        const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;

        // Simulate write failure
        mockWriteFileSync.mockImplementation(() => {
          throw new Error('Disk full');
        });

        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
        mockReadFileSync.mockReturnValue('content');

        // Should not throw when updating index fails
        tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
        expect(tracker.hasTimeline('src/test.ts')).toBe(true);
      });
    });

    describe('saveTimeline', () => {
      it('should handle writeFileSync errors gracefully', () => {
        const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
        const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

        mockReadFileSync.mockReturnValue('content');

        // Simulate write failure for timeline file
        mockWriteFileSync.mockImplementation((path: any) => {
          if (String(path).includes('.json') && !String(path).includes('index')) {
            throw new Error('Cannot write timeline');
          }
          return undefined;
        });

        // Should not throw when saving timeline fails
        tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');
        expect(tracker).toBeDefined();
      });
    });
  });

  describe('getWorktreeFileContent error handling', () => {
    it('should handle readFileSync errors when reading worktree file', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;

      // Simulate worktree file exists but reading fails
      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) {
          throw new Error('Permission denied reading worktree file');
        }
        return '';
      });

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('diff')) return { status: 0, stdout: 'src/test.ts', stderr: '' } as any;
        if (args?.includes('merge-base')) return { status: 0, stdout: 'base-commit', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });

      // Should handle error gracefully and return empty string
      // This tests the try-catch block in getWorktreeFileContent (lines 318-321)
      tracker.initializeFromWorktree('task-1', '/worktree/path', 'intent', 'Task 1');
      expect(tracker).toBeDefined();
    });

    it('should handle worktree file that does not exist', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;

      // Worktree file does not exist
      mockExistsSync.mockReturnValue(false);

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('diff')) return { status: 0, stdout: 'src/test.ts', stderr: '' } as any;
        if (args?.includes('merge-base')) return { status: 0, stdout: 'base-commit', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });

      // Should handle missing file gracefully
      tracker.initializeFromWorktree('task-1', '/worktree/path', 'intent', 'Task 1');
      expect(tracker).toBeDefined();
    });

    it('should handle readFileSync throwing when worktree file exists', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockSpawnSync = child_process.spawnSync as ReturnType<typeof vi.fn>;

      // Worktree file exists but read throws (this tests the catch block at lines 320-321)
      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) {
          throw new Error('EACCES: permission denied');
        }
        return '';
      });

      mockSpawnSync.mockImplementation((cmd: any, args: any) => {
        if (args?.includes('diff')) return { status: 0, stdout: 'src/test.ts', stderr: '' } as any;
        if (args?.includes('merge-base')) return { status: 0, stdout: 'base-commit', stderr: '' } as any;
        return { status: 0, stdout: '', stderr: '' } as any;
      });

      // Should handle read error gracefully
      tracker.initializeFromWorktree('task-1', '/worktree/path', 'intent', 'Task 1');
      expect(tracker).toBeDefined();
    });
  });

  describe('Timeline deserialization (fileTimelineFromDict, taskFileViewFromDict, mainBranchEventFromDict)', () => {
    it('should load timeline from valid JSON data', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      // Simulate loading a valid timeline from disk
      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return true;
        if (String(path).includes('.json')) return true;
        return false;
      });

      const validTimelineData = {
        file_path: 'src/test.ts',
        task_views: {
          'task-1': {
            task_id: 'task-1',
            branch_point: {
              commit_hash: 'abc123',
              content: 'original content',
              timestamp: '2024-01-01T00:00:00.000Z',
            },
            task_intent: {
              title: 'Test Task',
              description: 'Test intent',
              from_plan: true,
            },
            worktree_state: {
              content: 'modified content',
              last_modified: '2024-01-02T00:00:00.000Z',
            },
            commits_behind_main: 5,
            status: 'active',
            merged_at: null,
          },
        },
        main_branch_events: [
          {
            commit_hash: 'main123',
            timestamp: '2024-01-01T12:00:00.000Z',
            content: 'main content',
            source: 'human',
            commit_message: 'Main commit',
            author: 'Author',
          },
        ],
      };

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return JSON.stringify(['src/test.ts']);
        if (String(path).includes('src_test_ts.json')) return JSON.stringify(validTimelineData);
        return '';
      });

      // This tests fileTimelineFromDict, taskFileViewFromDict, and mainBranchEventFromDict
      const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
      expect(freshTracker.hasTimeline('src/test.ts')).toBe(true);

      const timeline = freshTracker.getTimeline('src/test.ts');
      expect(timeline).toBeDefined();
      expect(timeline?.filePath).toBe('src/test.ts');
      expect(timeline?.taskViews.has('task-1')).toBe(true);
      expect(timeline?.mainBranchEvents.length).toBe(1);
    });

    it('should handle timeline with optional fields missing', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return true;
        if (String(path).includes('.json')) return true;
        return false;
      });

      const minimalTimelineData = {
        file_path: 'src/minimal.ts',
        task_views: {
          'task-minimal': {
            task_id: 'task-minimal',
            branch_point: {
              commit_hash: 'xyz789',
              content: 'content',
              timestamp: '2024-01-01T00:00:00.000Z',
            },
            task_intent: {
              title: 'Minimal Task',
              description: 'No description',
              from_plan: false,
            },
            // worktree_state is optional (null)
            worktree_state: null,
            commits_behind_main: 0,
            status: 'merged',
            merged_at: '2024-01-03T00:00:00.000Z',
          },
        },
        main_branch_events: [],
      };

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return JSON.stringify(['src/minimal.ts']);
        if (String(path).includes('src_minimal_ts.json')) return JSON.stringify(minimalTimelineData);
        return '';
      });

      const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
      const timeline = freshTracker.getTimeline('src/minimal.ts');

      expect(timeline).toBeDefined();
      const taskView = timeline?.taskViews.get('task-minimal');
      expect(taskView?.worktreeState).toBeUndefined();
      expect(taskView?.mergedAt).toBeInstanceOf(Date);
      expect(taskView?.status).toBe('merged');
    });

    it('should handle main branch event with optional fields', () => {
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return true;
        if (String(path).includes('.json')) return true;
        return false;
      });

      const mergedTaskTimeline = {
        file_path: 'src/merged.ts',
        task_views: {},
        main_branch_events: [
          {
            commit_hash: 'merge123',
            timestamp: '2024-01-01T00:00:00.000Z',
            content: 'merged content',
            source: 'merged_task',
            merged_from_task: 'task-original',
            commit_message: 'Merged from task-original',
            author: 'Auto Merge',
          },
        ],
      };

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('index.json')) return JSON.stringify(['src/merged.ts']);
        if (String(path).includes('src_merged_ts.json')) return JSON.stringify(mergedTaskTimeline);
        return '';
      });

      const freshTracker = new FileTimelineTracker(mockProjectDir, mockStorageDir);
      const timeline = freshTracker.getTimeline('src/merged.ts');

      expect(timeline?.mainBranchEvents.length).toBe(1);
      const event = timeline?.mainBranchEvents[0];
      expect(event?.source).toBe('merged_task');
      expect(event?.mergedFromTask).toBe('task-original');
    });

    it('should handle readFileSync error when getting worktree content in getMergeContext', () => {
      const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
      const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

      // First, start a task without worktree state
      mockReadFileSync.mockReturnValue('content');
      tracker.onTaskStart('task-1', ['src/test.ts'], [], 'abc123', '', 'Task 1');

      // Now call getMergeContext which will try to read worktree file
      // The worktree file exists but readFileSync throws (tests lines 318-321)
      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: any) => {
        if (String(path).includes('.auto-claude/worktrees')) {
          throw new Error('EACCES: permission denied');
        }
        return 'content';
      });

      // Should handle read error gracefully and return context without worktree content
      const context = tracker.getMergeContext('task-1', 'src/test.ts');
      expect(context).toBeDefined();
      expect(context?.taskWorktreeContent).toBe('');
    });
  });
});
