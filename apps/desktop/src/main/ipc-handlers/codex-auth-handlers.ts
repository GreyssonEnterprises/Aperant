/**
 * Codex Authentication IPC Handlers
 *
 * IPC handlers for Codex OAuth authentication:
 * - codex-auth-login - Start OAuth flow to authenticate with Codex
 * - codex-auth-status - Get current authentication status
 * - codex-auth-logout - Clear authentication and logout
 */

import { ipcMain } from 'electron';
import { startCodexOAuthFlow, getCodexAuthState, clearCodexAuth } from '../ai/auth/codex-oauth';

/**
 * Register all Codex authentication-related IPC handlers
 */
export function registerCodexAuthHandlers(): void {
  /**
   * Start Codex OAuth login flow
   * Opens browser for user authentication and returns the auth result
   */
  ipcMain.handle('codex-auth-login', async () => {
    try {
      const result = await startCodexOAuthFlow();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Get current Codex authentication status
   * Returns the current auth state including tokens and user info
   */
  ipcMain.handle('codex-auth-status', async () => {
    try {
      const state = await getCodexAuthState();
      return { success: true, data: state };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  /**
   * Logout from Codex and clear authentication
   * Removes stored tokens and clears the auth state
   */
  ipcMain.handle('codex-auth-logout', async () => {
    try {
      await clearCodexAuth();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
