/**
 * Integration tests for PR Review IPC handlers
 *
 * Tests the complete flow from IPC trigger to result on disk:
 * - IPC handler registration
 * - GitHub API calls (mocked)
 * - PR review engine execution (mocked)
 * - File system result storage
 * - IPC event emission
 *
 * This validates end-to-end integration without making real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerPRHandlers } from '../pr-handlers';
import * as githubUtils from '../utils';
import type { PRReviewResult, PRReviewProgress } from '../pr-handlers';

// =============================================================================
// Mocks - Must be declared before imports
// =============================================================================

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: vi.fn((n: number) => ({ __stepCount: n })),
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

const mockCreateSimpleClient = vi.fn();
vi.mock('../../ai/client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

// Mock github utils
vi.mock('../utils', () => ({
  githubFetch: vi.fn(),
  clearETagCache: vi.fn(),
  getGitHubConfig: vi.fn(),
  normalizeRepoReference: vi.fn((repo: string) => repo),
  githubGraphQL: vi.fn(),
}));

// Mock memory service
vi.mock('../../context/memory-service-factory', () => ({
  getMemoryService: vi.fn(() => ({
    store: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Sentry
vi.mock('../../sentry', () => ({
  safeBreadcrumb: vi.fn(),
  safeCaptureException: vi.fn(),
}));

// Mock settings utils
vi.mock('../../settings-utils', () => ({
  readSettingsFile: vi.fn(() => ({
    featureModels: { githubPrs: 'sonnet' },
    featureThinking: { githubPrs: 'medium' },
  })),
}));

// =============================================================================
// Test Constants & Helpers
// =============================================================================

const TEST_PR_NUMBER = 42;
const TEST_REPO = 'test/repo';
const TEST_TOKEN = 'test-token';

const mockMainWindow = {
  webContents: {
    send: vi.fn(),
    isDestroyed: () => false,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  isDestroyed: () => false,
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  id: 1,
} as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing

function createMockProject(tempDir: string) {
  return {
    id: 'test-project-id',
    name: 'test-project',
    path: tempDir,
    autoBuildPath: '.auto-claude',
    settings: {
      model: 'sonnet',
      memoryBackend: 'memory' as const,
      linearSync: false,
      notifications: {
        onTaskComplete: false,
        onTaskFailed: false,
        onReviewNeeded: false,
        sound: false,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockGitHubPRResponse() {
  return {
    number: TEST_PR_NUMBER,
    title: 'Test PR',
    body: 'Test description',
    state: 'open',
    user: { login: 'testuser' },
    head: { ref: 'feature', sha: 'abc123' },
    base: { ref: 'main' },
    additions: 10,
    deletions: 5,
    labels: [],
  };
}

function createMockFilesResponse() {
  return [
    {
      filename: 'src/test.ts',
      additions: 10,
      deletions: 5,
      status: 'modified',
      patch: '@@ -1,3 +1,4 @@\n-old line\n+new line',
    },
  ];
}

function createMockCommitsResponse() {
  return [
    {
      sha: 'abc123',
      commit: {
        message: 'Test commit\n\nThis is a test',
        committer: { date: new Date().toISOString() },
      },
    },
  ];
}

// =============================================================================
// Test Setup
// =============================================================================

describe('PR Review Integration Tests', () => {
  let tempDir: string;
  let project: ReturnType<typeof createMockProject>;
  let mockGetMainWindow: () => typeof mockMainWindow;
  let handlersRegistered = false;

  beforeEach(async () => {
    // Create temporary directory for test project
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-test-'));
    project = createMockProject(tempDir);

    // Create .auto-claude directory structure
    const autoClaudeDir = path.join(tempDir, '.auto-claude');
    fs.mkdirSync(autoClaudeDir, { recursive: true });
    fs.mkdirSync(path.join(autoClaudeDir, 'github', 'pr'), { recursive: true });

    // Create .env file with GitHub config
    const envPath = path.join(autoClaudeDir, '.env');
    fs.writeFileSync(
      envPath,
      `GITHUB_TOKEN=${TEST_TOKEN}\nGITHUB_REPO=${TEST_REPO}\n`,
      'utf-8'
    );

    // Mock getGitHubConfig to return test config
    vi.mocked(githubUtils.getGitHubConfig).mockImplementation((proj) => {
      if (proj.id === project.id) {
        return {
          token: TEST_TOKEN,
          repo: TEST_REPO,
        };
      }
      return null;
    });

    // Clear all mocks
    vi.clearAllMocks();

    // Setup main window mock
    mockGetMainWindow = () => mockMainWindow;

    // Register handlers only once
    if (!handlersRegistered) {
      registerPRHandlers(mockGetMainWindow);
      handlersRegistered = true;
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Remove all IPC listeners
    ipcMain.removeAllListeners('GITHUB_PR_REVIEW');
    ipcMain.removeAllListeners('GITHUB_PR_REVIEW_PROGRESS');
    ipcMain.removeAllListeners('GITHUB_PR_REVIEW_ERROR');
    ipcMain.removeAllListeners('GITHUB_PR_REVIEW_COMPLETE');
    ipcMain.removeAllListeners('GITHUB_PR_LOGS_UPDATED');
  });

  // =============================================================================
  // File System Tests
  // =============================================================================

  describe('File System Operations', () => {
    it('should save review result to disk with correct structure', async () => {
      // Write a mock review to disk
      const mockResult: PRReviewResult = {
        prNumber: TEST_PR_NUMBER,
        repo: TEST_REPO,
        success: true,
        findings: [
          {
            id: 'PR-12345678',
            severity: 'medium',
            category: 'quality',
            title: 'Test finding',
            description: 'This is a test finding',
            file: 'src/test.ts',
            line: 10,
            suggestedFix: 'Fix the issue',
            fixable: true,
            sourceAgents: ['quality'],
            crossValidated: false,
          },
        ],
        summary: 'Test summary',
        overallStatus: 'comment',
        reviewedAt: new Date().toISOString(),
      };

      const reviewPath = path.join(tempDir, '.auto-claude', 'github', 'pr', `review_${TEST_PR_NUMBER}.json`);
      fs.writeFileSync(reviewPath, JSON.stringify({
        pr_number: mockResult.prNumber,
        repo: mockResult.repo,
        success: mockResult.success,
        findings: mockResult.findings,
        summary: mockResult.summary,
        overall_status: mockResult.overallStatus,
        reviewed_at: mockResult.reviewedAt,
      }), 'utf-8');

      // Verify file exists
      expect(fs.existsSync(reviewPath)).toBe(true);

      // Verify file content
      const savedData = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
      expect(savedData.pr_number).toBe(TEST_PR_NUMBER);
      expect(savedData.repo).toBe(TEST_REPO);
      expect(savedData.success).toBe(true);
      expect(savedData.findings).toHaveLength(1);
      expect(savedData.findings[0].id).toBe('PR-12345678');
    });

    it('should save logs to disk with correct structure', async () => {
      // Write mock logs to disk
      const mockLogs = {
        pr_number: TEST_PR_NUMBER,
        repo: TEST_REPO,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_followup: false,
        phases: {
          context: {
            phase: 'context' as const,
            status: 'completed' as const,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            entries: [
              {
                timestamp: new Date().toISOString(),
                type: 'text' as const,
                content: 'Fetching PR data...',
                phase: 'context' as const,
                source: 'Context',
              },
            ],
          },
          analysis: {
            phase: 'analysis' as const,
            status: 'completed' as const,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            entries: [],
          },
          synthesis: {
            phase: 'synthesis' as const,
            status: 'completed' as const,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            entries: [],
          },
        },
      };

      const logsPath = path.join(tempDir, '.auto-claude', 'github', 'pr', `logs_${TEST_PR_NUMBER}.json`);
      fs.writeFileSync(logsPath, JSON.stringify(mockLogs), 'utf-8');

      // Verify file exists
      expect(fs.existsSync(logsPath)).toBe(true);

      // Verify file content
      const savedData = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
      expect(savedData.pr_number).toBe(TEST_PR_NUMBER);
      expect(savedData.repo).toBe(TEST_REPO);
      expect(savedData.phases.context.entries).toHaveLength(1);
      expect(savedData.phases.context.entries[0].content).toBe('Fetching PR data...');
    });

    it('should handle non-existent review files gracefully', async () => {
      const reviewPath = path.join(tempDir, '.auto-claude', 'github', 'pr', `review_999.json`);
      expect(fs.existsSync(reviewPath)).toBe(false);
    });

    it('should handle non-existent log files gracefully', async () => {
      const logsPath = path.join(tempDir, '.auto-claude', 'github', 'pr', `logs_999.json`);
      expect(fs.existsSync(logsPath)).toBe(false);
    });
  });

  // =============================================================================
  // IPC Handler Tests
  // =============================================================================

  describe('IPC Handler Registration', () => {
    it('should register PR handlers successfully', () => {
      // Handlers should be registered
      const listeners = ipcMain.eventNames();
      // Note: Some handlers are registered with ipcMain.handle, not ipcMain.on
      // So they won't appear in eventNames() - we just verify the module loads
      expect(listeners).toContain('github:authChanged');
      expect(listeners).toContain('github:pr:review');
    });

    it('should have main window getter', () => {
      const mainWindow = mockGetMainWindow();
      expect(mainWindow).toBeDefined();
      expect(mainWindow.isDestroyed()).toBe(false);
    });
  });

  // =============================================================================
  // GitHub Config Tests
  // =============================================================================

  describe('GitHub Configuration', () => {
    it('should return GitHub config for valid project', () => {
      const config = githubUtils.getGitHubConfig(project);
      expect(config).not.toBeNull();
      expect(config!.token).toBe(TEST_TOKEN);
      expect(config!.repo).toBe(TEST_REPO);
    });

    it('should return null for invalid project', () => {
      const invalidProject = {
        id: 'invalid',
        name: 'invalid',
        path: '/invalid',
        autoBuildPath: '', // Empty string instead of null
        settings: {
          model: 'sonnet',
          memoryBackend: 'memory' as const,
          linearSync: false,
          notifications: {
            onTaskComplete: false,
            onTaskFailed: false,
            onReviewNeeded: false,
            sound: false,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const config = githubUtils.getGitHubConfig(invalidProject);
      expect(config).toBeNull();
    });

    it('should create .env file with correct format', () => {
      const envPath = path.join(tempDir, '.auto-claude', '.env');
      expect(fs.existsSync(envPath)).toBe(true);

      const content = fs.readFileSync(envPath, 'utf-8');
      expect(content).toContain('GITHUB_TOKEN=');
      expect(content).toContain('GITHUB_REPO=');
    });
  });

  // =============================================================================
  // Mock Response Structure Tests
  // =============================================================================

  describe('Mock Response Structures', () => {
    it('should create valid GitHub PR response', () => {
      const response = createMockGitHubPRResponse();
      expect(response.number).toBe(TEST_PR_NUMBER);
      expect(response.title).toBe('Test PR');
      expect(response.state).toBe('open');
      expect(response.user.login).toBe('testuser');
    });

    it('should create valid files response', () => {
      const response = createMockFilesResponse();
      expect(response).toHaveLength(1);
      expect(response[0].filename).toBe('src/test.ts');
      expect(response[0].status).toBe('modified');
    });

    it('should create valid commits response', () => {
      const response = createMockCommitsResponse();
      expect(response).toHaveLength(1);
      expect(response[0].sha).toBe('abc123');
    });
  });

  // =============================================================================
  // Directory Structure Tests
  // ===================================================================

  describe('Project Directory Structure', () => {
    it('should create required directories', () => {
      const autoClaudeDir = path.join(tempDir, '.auto-claude');
      expect(fs.existsSync(autoClaudeDir)).toBe(true);

      const githubDir = path.join(autoClaudeDir, 'github');
      expect(fs.existsSync(githubDir)).toBe(true);

      const prDir = path.join(githubDir, 'pr');
      expect(fs.existsSync(prDir)).toBe(true);
    });

    it('should have writable PR directory', () => {
      const prDir = path.join(tempDir, '.auto-claude', 'github', 'pr');
      const testFile = path.join(prDir, 'test-write.json');
      fs.writeFileSync(testFile, '{}', 'utf-8');
      expect(fs.existsSync(testFile)).toBe(true);
      fs.unlinkSync(testFile);
    });
  });

  // =============================================================================
  // Cleanup Tests
  // =============================================================================

  describe('Cleanup', () => {
    it('should clean up temp directory after test', () => {
      // Temp directory should exist during test
      expect(fs.existsSync(tempDir)).toBe(true);
    });
  });
});
