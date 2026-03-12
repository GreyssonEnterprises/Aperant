/**
 * Swap Notifier
 * =============
 *
 * Sends a UI notification when the auto-swap middleware switches accounts.
 * Bridges the AI middleware layer (no IPC access) to the renderer via
 * Electron's BrowserWindow.
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type { AutoSwapEvent } from '../providers/auto-swap-middleware';

/**
 * Notify the renderer that the middleware swapped to a different account.
 * Uses the existing PROACTIVE_SWAP_NOTIFICATION channel so the
 * ProactiveSwapListener component shows the swap toast.
 */
export function notifyRendererOfSwap(event: AutoSwapEvent): void {
  console.log('[AutoSwap] Sending UI notification:', event.fromAccountName, '→', event.toAccountName);
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) {
    console.log('[AutoSwap] No BrowserWindow found — UI notification skipped');
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.PROACTIVE_SWAP_NOTIFICATION, {
    fromProfile: { id: event.fromAccountId, name: event.fromAccountName },
    toProfile: { id: event.toAccountId, name: event.toAccountName },
    reason: 'reactive-middleware',
  });
  console.log('[AutoSwap] UI notification sent via PROACTIVE_SWAP_NOTIFICATION channel');
}
