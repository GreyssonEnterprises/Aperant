/**
 * GitHub integration IPC handlers
 *
 * Main entry point that registers all GitHub-related handlers.
 * Handlers are organized into modules by functionality:
 * - repository-handlers: Repository and connection management
 * - issue-handlers: Issue fetching and retrieval
 * - investigation-handlers: AI-powered issue investigation
 * - import-handlers: Bulk issue import
 * - release-handlers: GitHub release creation
 * - oauth-handlers: GitHub CLI OAuth authentication
 * - autofix-handlers: Automatic issue fixing with label triggers
 * - pr-handlers: PR review, polling status, and status updates
 * - triage-handlers: Issue triage automation
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { AgentManager } from '../../agent';
import { IPC_CHANNELS } from '../../../shared/constants';
import { registerRepositoryHandlers } from './repository-handlers';
import { registerIssueHandlers } from './issue-handlers';
import { registerInvestigationHandlers } from './investigation-handlers';
import { registerImportHandlers } from './import-handlers';
import { registerReleaseHandlers } from './release-handlers';
import { registerGithubOAuthHandlers } from './oauth-handlers';
import { registerAutoFixHandlers } from './autofix-handlers';
import { registerPRHandlers } from './pr-handlers';
import { registerTriageHandlers } from './triage-handlers';

/**
 * Register all GitHub-related IPC handlers
 * @returns Cleanup function to remove all listeners
 */
export function registerGithubHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): () => void {
  registerRepositoryHandlers();
  registerIssueHandlers();
  registerInvestigationHandlers(agentManager, getMainWindow);
  registerImportHandlers(agentManager);
  registerReleaseHandlers();
  registerGithubOAuthHandlers();
  registerAutoFixHandlers(agentManager, getMainWindow);
  registerPRHandlers(getMainWindow);
  registerTriageHandlers(getMainWindow);

  // Return cleanup - removes EventEmitter listeners from sub-handlers
  // Note: This only cleans up listeners added via ipcMain.on()
  return (): void => {
    const emitter = ipcMain as { removeAllListeners?: (event: string) => void };

    // Autofix listeners
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_AUTOFIX_START);
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_AUTOFIX_BATCH);
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW);

    // Auth changed listener
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_AUTH_CHANGED);

    // PR review listeners
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_PR_REVIEW);
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_PR_FOLLOWUP_REVIEW);

    // Triage listeners
    emitter.removeAllListeners?.(IPC_CHANNELS.GITHUB_TRIAGE_RUN);
  };
}

// Re-export utilities for potential external use
export { getGitHubConfig, githubFetch } from './utils';
export type { GitHubConfig } from './types';
