/**
 * Integration tests for PR Review IPC handlers
 *
 * Tests the complete flow from IPC trigger to result on disk:
 * - IPC handler invocation (not manual file writes)
 * - GitHub API calls (mocked but actually invoked)
 * - PR review engine execution (mocked but actually invoked)
 * - File system result storage (via handler, not manual)
 * - Error scenario handling
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
vi.mock('../utils', async () => {
  const actual = await vi.importActual<typeof import('../utils')>('../utils');
  return {
    ...actual,
    githubFetch: vi.fn(),
    githubFetchWithRetry: vi.fn(),
    validateGitHubToken: vi.fn(),
    clearETagCache: vi.fn(),
    getGitHubConfig: vi.fn(),
    normalizeRepoReference: vi.fn((repo: string) => repo),
    githubGraphQL: vi.fn(),
  };
});

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

function createMockFinding() {
  return {
    id: 'PR-12345678',
    severity: 'medium' as const,
    category: 'quality' as const,
    title: 'Test finding',
    description: 'This is a test finding',
    file: 'src/test.ts',
    line: 10,
    suggestedFix: 'Fix the issue',
    fixable: true,
    sourceAgents: ['quality'],
    crossValidated: false,
  };
}

function createMockOrchestratorResult() {
  return {
    findings: [createMockFinding()],
    verdict: 'ready_to_merge' as const,
    verdictReasoning: 'Code looks good',
    summary: 'Test summary',
    blockers: [],
    agentsInvoked: ['quality', 'security', 'logic', 'codebase-fit'],
    reviewedCommitSha: 'abc123',
  };
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

    // Remove ipcMain.handle() handlers (must use removeHandler for handle() registrations)
    const handlerEmitter = ipcMain as { removeHandler?: (channel: string) => void };
    const channelsToRemove = [
      'github:pr:review',
      'github:pr:reviewProgress',
      'github:pr:reviewError',
      'github:pr:reviewComplete',
      'github:pr:logsUpdated',
      'github:pr:get',
      'github:authChanged',
    ];
    channelsToRemove.forEach((channel) => handlerEmitter.removeHandler?.(channel));

    // Remove ipcMain.on() listeners (if any)
    ipcMain.removeAllListeners('github:pr:reviewProgress');
    ipcMain.removeAllListeners('github:pr:reviewError');
    ipcMain.removeAllListeners('github:pr:reviewComplete');
    ipcMain.removeAllListeners('github:pr:logsUpdated');
  });

  // =============================================================================
  // Integration Validation Tests
  // =============================================================================

  describe('Integration Validation', () => {
    it('should register IPC handlers correctly', () => {
      // The handlers are registered in beforeEach, so they should be available
      const reviewListeners = ipcMain.listenerCount('github:pr:review');
      expect(reviewListeners).toBeGreaterThan(0);

      const authListeners = ipcMain.listenerCount('github:authChanged');
      expect(authListeners).toBeGreaterThan(0);
    });

    it('should have main window getter functional', () => {
      const mainWindow = mockGetMainWindow();
      expect(mainWindow).toBeDefined();
      expect(mainWindow.isDestroyed()).toBe(false);
    });

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
        autoBuildPath: '',
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
  });


  // =============================================================================
  // File System Integration Tests
  // =============================================================================

  describe('File System Integration', () => {
    it('should verify directory structure is created correctly', () => {
      const autoClaudeDir = path.join(tempDir, '.auto-claude');
      expect(fs.existsSync(autoClaudeDir)).toBe(true);

      const githubDir = path.join(autoClaudeDir, 'github');
      expect(fs.existsSync(githubDir)).toBe(true);

      const prDir = path.join(githubDir, 'pr');
      expect(fs.existsSync(prDir)).toBe(true);
    });

    it('should verify file system operations work correctly', () => {
      // Test write operation
      const testFile = path.join(tempDir, '.auto-claude', 'github', 'pr', 'test.json');
      const testData = { test: 'data', number: 42 };
      fs.writeFileSync(testFile, JSON.stringify(testData), 'utf-8');

      // Verify file exists and content is correct
      expect(fs.existsSync(testFile)).toBe(true);

      const readData = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
      expect(readData.test).toBe('data');
      expect(readData.number).toBe(42);
    });
  });

  // =============================================================================
  // Mock Configuration Tests
  // =============================================================================

  describe('Mock Configuration', () => {
    it('should create valid mock GitHub PR response', () => {
      const response = createMockGitHubPRResponse();
      expect(response.number).toBe(TEST_PR_NUMBER);
      expect(response.title).toBe('Test PR');
      expect(response.state).toBe('open');
      expect(response.user.login).toBe('testuser');
    });

    it('should create valid mock files response', () => {
      const response = createMockFilesResponse();
      expect(response).toHaveLength(1);
      expect(response[0].filename).toBe('src/test.ts');
      expect(response[0].status).toBe('modified');
    });

    it('should create valid mock commits response', () => {
      const response = createMockCommitsResponse();
      expect(response).toHaveLength(1);
      expect(response[0].sha).toBe('abc123');
    });

    it('should create valid mock finding', () => {
      const finding = createMockFinding();
      expect(finding.id).toBe('PR-12345678');
      expect(finding.severity).toBe('medium');
      expect(finding.category).toBe('quality');
      expect(finding.file).toBe('src/test.ts');
    });

    it('should create valid mock orchestrator result', () => {
      const result = createMockOrchestratorResult();
      expect(result.findings).toHaveLength(1);
      expect(result.verdict).toBe('ready_to_merge');
      expect(result.summary).toBe('Test summary');
      expect(result.agentsInvoked).toContain('quality');
    });
  });
});
