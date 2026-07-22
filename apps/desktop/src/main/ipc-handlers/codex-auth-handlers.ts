import { BrowserWindow, ipcMain, shell } from 'electron';
import type { ProviderAccount } from '@shared/types/provider-account';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import { readSettingsFile } from '../settings-utils';
import { getCodexAppServerManager } from '../services/codex/codex-app-server-runtime';
import { subscribeCodexAccountNotifications } from '../services/codex/codex-app-server-runtime';
import type { CodexAuthNotification } from '../services/codex/codex-app-server-runtime';
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
  publishAuthChanged(event: CodexAuthChanged): void;
}

export interface CodexAuthStatus {
  isAuthenticated: boolean;
  email?: string;
  planType?: string;
}

export interface CodexAuthChanged {
  accountId: string;
  loginId: string;
  success: boolean;
  status: 'authenticated' | 'failed';
}

function publishAuthChanged(event: CodexAuthChanged): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.CODEX_AUTH_CHANGED, event);
  }
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
    publishAuthChanged,
    ...overrides,
  };
  const startingLogins = new Map<string, symbol>();
  const pendingLogins = new Map<string, string>();
  const bufferedCompletions = new Map<string, Map<string, CodexAuthNotification>>();

  function validate(accountId: unknown): accountId is string {
    return typeof accountId === 'string' && accountId.length <= 256 &&
      accountExists(dependencies.readAccounts(), accountId);
  }

  function complete(event: CodexAuthNotification): CodexAuthChanged {
    pendingLogins.delete(event.accountId);
    const changed: CodexAuthChanged = {
      accountId: event.accountId,
      loginId: event.loginId,
      success: event.success,
      status: event.success ? 'authenticated' : 'failed',
    };
    dependencies.publishAuthChanged(changed);
    return changed;
  }

  function handleNotification(event: CodexAuthNotification): CodexAuthChanged | undefined {
    if (!event.accountId || event.accountId.length > 256 ||
      !event.loginId || event.loginId.length > 256 || typeof event.success !== 'boolean') return;
    if (pendingLogins.get(event.accountId) === event.loginId) return complete(event);
    if (!startingLogins.has(event.accountId)) return;
    let accountBuffer = bufferedCompletions.get(event.accountId);
    if (!accountBuffer) {
      accountBuffer = new Map();
      bufferedCompletions.set(event.accountId, accountBuffer);
    }
    if (accountBuffer.size >= 8 && !accountBuffer.has(event.loginId)) {
      const oldest = accountBuffer.keys().next().value;
      if (oldest) accountBuffer.delete(oldest);
    }
    accountBuffer.set(event.loginId, event);
  }

  return {
    async login(accountId: unknown) {
      if (!validate(accountId)) {
        return { success: false as const, error: 'Codex subscription account not found' };
      }
      const loginToken = Symbol(accountId);
      startingLogins.set(accountId, loginToken);
      pendingLogins.delete(accountId);
      bufferedCompletions.delete(accountId);
      try {
        const result = await dependencies.getManager().startLogin(accountId);
        if (startingLogins.get(accountId) !== loginToken) {
          return { success: false as const, error: 'Codex authentication was superseded' };
        }
        if (result.type === 'chatgpt') {
          await dependencies.openExternal(result.authUrl);
        } else {
          await dependencies.openExternal(result.verificationUrl);
        }
        if (startingLogins.get(accountId) !== loginToken) {
          return { success: false as const, error: 'Codex authentication was superseded' };
        }
        pendingLogins.set(accountId, result.loginId);
        startingLogins.delete(accountId);
        const buffered = bufferedCompletions.get(accountId)?.get(result.loginId);
        bufferedCompletions.delete(accountId);
        const completion = buffered ? complete(buffered) : undefined;
        return {
          success: true as const,
          data: {
            type: result.type,
            loginId: result.loginId,
            ...(result.type === 'chatgptDeviceCode' ? { userCode: result.userCode } : {}),
            ...(completion ? { completion } : {}),
          },
        };
      } catch {
        if (startingLogins.get(accountId) === loginToken) startingLogins.delete(accountId);
        bufferedCompletions.delete(accountId);
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
    handleNotification,
  };
}

export function registerCodexAuthHandlers(): void {
  const handlers = createCodexAuthHandlers();
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGIN, (_event, accountId) => handlers.login(accountId));
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_STATUS, (_event, accountId) => handlers.status(accountId));
  ipcMain.handle(IPC_CHANNELS.CODEX_AUTH_LOGOUT, (_event, accountId) => handlers.logout(accountId));
  subscribeCodexAccountNotifications((event) => handlers.handleNotification(event));
}
