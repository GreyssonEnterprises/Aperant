import { BrowserWindow, ipcMain, shell } from 'electron';
import type { ProviderAccount } from '@shared/types/provider-account';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import { readSettingsFile } from '../settings-utils';
import { getCodexAppServerManager } from '../services/codex/codex-app-server-runtime';
import { subscribeCodexAccountNotifications } from '../services/codex/codex-app-server-runtime';
import type {
  CodexAccountReadResponse,
  CodexLoginStartResponse,
} from '../services/codex/codex-app-server-protocol';

interface CodexAuthManager {
  startLogin(accountId: string): Promise<CodexLoginStartResponse>;
  readAccount(accountId: string): Promise<CodexAccountReadResponse>;
}

interface Dependencies {
  getManager(): CodexAuthManager;
  readAccounts(): ProviderAccount[];
  openExternal(url: string): Promise<unknown>;
}

export interface CodexAuthStatus {
  isAuthenticated: boolean;
  email?: string;
  planType?: string;
}

function defaultAccounts(): ProviderAccount[] {
  return (readSettingsFile()?.providerAccounts as ProviderAccount[] | undefined) ?? [];
}

function accountExists(accounts: ProviderAccount[], accountId: string): boolean {
  const account = accounts.find((candidate) => candidate.id === accountId);
  return account?.provider === 'openai' && account.authType === 'oauth' &&
    account.billingModel === 'subscription';
}

export function createCodexAuthHandlers(overrides?: Partial<Dependencies>) {
  const dependencies: Dependencies = {
    getManager: getCodexAppServerManager,
    readAccounts: defaultAccounts,
    openExternal: (url) => shell.openExternal(url),
    ...overrides,
  };

  function validate(accountId: unknown): accountId is string {
    return typeof accountId === 'string' && accountId.length <= 256 &&
      accountExists(dependencies.readAccounts(), accountId);
  }

  return {
    async login(accountId: unknown) {
      if (!validate(accountId)) {
        return { success: false as const, error: 'Codex subscription account not found' };
      }
      try {
        const result = await dependencies.getManager().startLogin(accountId);
        if (result.type === 'chatgpt') {
          await dependencies.openExternal(result.authUrl);
          return {
            success: true as const,
            data: { type: result.type, loginId: result.loginId },
          };
        }
        await dependencies.openExternal(result.verificationUrl);
        return {
          success: true as const,
          data: { type: result.type, loginId: result.loginId, userCode: result.userCode },
        };
      } catch {
        return { success: false as const, error: 'Codex authentication could not be started' };
      }
    },

    async status(accountId: unknown) {
      if (!validate(accountId)) {
        return { success: false as const, error: 'Codex subscription account not found' };
      }
      try {
        const result = await dependencies.getManager().readAccount(accountId);
        if (result.account?.type !== 'chatgpt') {
          return { success: true as const, data: { isAuthenticated: false } };
        }
        return {
          success: true as const,
          data: {
            isAuthenticated: true,
            ...(result.account.email ? { email: result.account.email } : {}),
            planType: result.account.planType,
          },
        };
      } catch {
        return { success: false as const, error: 'Codex authentication status is unavailable' };
      }
    },

    async logout(accountId: unknown) {
      if (!validate(accountId)) {
        return { success: false as const, error: 'Codex subscription account not found' };
      }
      return {
        success: false as const,
        error: 'Remove the provider account to stop using this Codex subscription',
      };
    },
  };
}

function registerLegacyCodexAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGIN, async () => {
    try {
      const { startCodexOAuthFlow } = await import('../ai/auth/codex-oauth');
      const result = await startCodexOAuthFlow();
      return {
        success: true,
        data: {
          isAuthenticated: true,
          ...(result.email ? { email: result.email } : {}),
        },
      };
    } catch {
      return { success: false, error: 'Legacy Codex authentication could not be started' };
    }
  });
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_STATUS, async () => {
    try {
      const { getCodexAuthState } = await import('../ai/auth/codex-oauth');
      const state = await getCodexAuthState();
      return {
        success: true,
        data: { isAuthenticated: state.isAuthenticated },
      };
    } catch {
      return { success: false, error: 'Legacy Codex authentication status is unavailable' };
    }
  });
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGOUT, async () => {
    try {
      const { clearCodexAuth } = await import('../ai/auth/codex-oauth');
      await clearCodexAuth();
      return { success: true };
    } catch {
      return { success: false, error: 'Legacy Codex authentication could not be cleared' };
    }
  });
}

export function registerCodexAuthHandlers(): void {
  if (process.env.APERANT_ENABLE_LEGACY_CODEX_OAUTH === '1') {
    registerLegacyCodexAuthHandlers();
    return;
  }
  const handlers = createCodexAuthHandlers();
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGIN, (_event, accountId) => handlers.login(accountId));
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_STATUS, (_event, accountId) => handlers.status(accountId));
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGOUT, (_event, accountId) => handlers.logout(accountId));
  subscribeCodexAccountNotifications((accountId, method) => {
    if (method !== 'account/login/completed' && method !== 'account/updated') return;
    void handlers.status(accountId).then((result) => {
      if (!result.success) return;
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_CHANNELS.CODEX_AUTH_CHANGED, {
          accountId,
          ...result.data,
        });
      }
    });
  });
}
