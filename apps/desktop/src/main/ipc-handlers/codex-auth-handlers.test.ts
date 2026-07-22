import { describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { ProviderAccount } from '@shared/types/provider-account';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import { createCodexAuthHandlers, registerCodexAuthHandlers } from './codex-auth-handlers';

const legacyAuth = vi.hoisted(() => ({
  startCodexOAuthFlow: vi.fn(),
  getCodexAuthState: vi.fn(),
  clearCodexAuth: vi.fn(),
}));

vi.mock('../ai/auth/codex-oauth', () => legacyAuth);

const account: ProviderAccount = {
  id: 'account-a',
  provider: 'openai',
  name: 'Codex subscription',
  authType: 'oauth',
  billingModel: 'subscription',
  createdAt: 1,
  updatedAt: 1,
};

function harness() {
  const manager = {
    startLogin: vi.fn().mockResolvedValue({
      type: 'chatgpt' as const,
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/start?secret=never-return-this',
    }),
    readAccount: vi.fn().mockResolvedValue({
      account: { type: 'chatgpt' as const, email: 'user@example.com', planType: 'plus' },
      requiresOpenaiAuth: true,
    }),
  };
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const publishAuthChanged = vi.fn();
  const handlers = createCodexAuthHandlers({
    getManager: () => manager,
    readAccounts: () => [account],
    openExternal,
    publishAuthChanged,
  });
  return { handlers, manager, openExternal, publishAuthChanged };
}

describe('Codex app-server authentication handlers', () => {
  it('starts account-scoped login, opens the validated URL in main, and returns no credential', async () => {
    const h = harness();
    await expect(h.handlers.login('account-a')).resolves.toEqual({
      success: true,
      data: { type: 'chatgpt', loginId: 'login-1' },
    });
    expect(h.manager.startLogin).toHaveBeenCalledWith('account-a');
    expect(h.openExternal).toHaveBeenCalledWith(
      'https://auth.openai.com/start?secret=never-return-this',
    );
    expect(JSON.stringify(await h.handlers.login('account-a'))).not.toContain('secret=');
  });

  it('returns only safe account status metadata after a fresh token refresh', async () => {
    const h = harness();
    const result = await h.handlers.status('account-a');
    expect(result).toEqual({
      success: true,
      data: { isAuthenticated: true, email: 'user@example.com', planType: 'plus' },
    });
    expect(result).not.toHaveProperty('data.accessToken');
    expect(result).not.toHaveProperty('data.refreshToken');
  });

  it('rejects unknown and non-subscription account IDs before runtime access', async () => {
    const h = harness();
    await expect(h.handlers.login('missing')).resolves.toEqual({
      success: false,
      error: 'Codex subscription account not found',
    });
    expect(h.manager.startLogin).not.toHaveBeenCalled();
  });

  it('maps auth expiry and private runtime errors to fixed public responses', async () => {
    const h = harness();
    h.manager.readAccount.mockResolvedValueOnce({ account: null, requiresOpenaiAuth: true });
    await expect(h.handlers.status('account-a')).resolves.toEqual({
      success: true,
      data: { isAuthenticated: false },
    });
    h.manager.readAccount.mockRejectedValueOnce(new Error('refresh_token=private-value'));
    await expect(h.handlers.status('account-a')).resolves.toEqual({
      success: false,
      error: 'Codex authentication status is unavailable',
    });
  });

  it('does not delete isolated or legacy credentials through the default transport', async () => {
    const h = harness();
    await expect(h.handlers.logout('account-a')).resolves.toEqual({
      success: false,
      error: 'Remove the provider account to stop using this Codex subscription',
    });
  });

  it('publishes only the completion matching the latest account-scoped login', async () => {
    const h = harness();
    await h.handlers.login('account-a');
    h.manager.startLogin.mockResolvedValueOnce({
      type: 'chatgpt', loginId: 'login-2', authUrl: 'https://auth.openai.com/second',
    });
    await h.handlers.login('account-a');

    h.handlers.handleNotification({ accountId: 'other-account', loginId: 'login-2', success: true });
    h.handlers.handleNotification({ accountId: 'account-a', loginId: 'login-1', success: true });
    h.handlers.handleNotification({ accountId: 'account-a', loginId: 'login-2', success: true });
    h.handlers.handleNotification({ accountId: 'account-a', loginId: 'login-2', success: true });

    expect(h.publishAuthChanged).toHaveBeenCalledTimes(1);
    expect(h.publishAuthChanged).toHaveBeenCalledWith({
      accountId: 'account-a',
      loginId: 'login-2',
      success: true,
      status: 'authenticated',
    });
  });

  it('publishes a correlated failed completion without private provider details', async () => {
    const h = harness();
    await h.handlers.login('account-a');

    h.handlers.handleNotification({ accountId: 'account-a', loginId: 'login-1', success: false });

    expect(h.publishAuthChanged).toHaveBeenCalledWith({
      accountId: 'account-a', loginId: 'login-1', success: false, status: 'failed',
    });
    expect(JSON.stringify(h.publishAuthChanged.mock.calls)).not.toContain('private');
  });

  it('buffers a fast completion during login start and returns it for renderer reconciliation', async () => {
    const h = harness();
    h.manager.startLogin.mockImplementationOnce(async () => {
      h.handlers.handleNotification({ accountId: 'account-a', loginId: 'login-fast', success: true });
      return {
        type: 'chatgpt', loginId: 'login-fast', authUrl: 'https://auth.openai.com/fast',
      };
    });

    await expect(h.handlers.login('account-a')).resolves.toEqual({
      success: true,
      data: {
        type: 'chatgpt',
        loginId: 'login-fast',
        completion: {
          accountId: 'account-a', loginId: 'login-fast', success: true,
          status: 'authenticated',
        },
      },
    });
    expect(h.publishAuthChanged).toHaveBeenCalledOnce();
  });

  it('does not treat an already-authenticated status read as reauthentication completion', async () => {
    const h = harness();
    await h.handlers.login('account-a');

    await h.handlers.status('account-a');

    expect(h.publishAuthChanged).not.toHaveBeenCalled();
  });

  it('ignores the removed legacy rollback flag and never imports or deletes legacy tokens', async () => {
    const previous = process.env.APERANT_ENABLE_LEGACY_CODEX_OAUTH;
    process.env.APERANT_ENABLE_LEGACY_CODEX_OAUTH = '1';
    try {
      registerCodexAuthHandlers();
      const testIpc = ipcMain as unknown as {
        invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown>;
      };
      await expect(testIpc.invokeHandler(
        IPC_CHANNELS.CODEX_AUTH_LOGIN,
        {},
        'missing-account',
      )).resolves.toEqual({
        success: false,
        error: 'Codex subscription account not found',
      });
      await testIpc.invokeHandler(IPC_CHANNELS.CODEX_AUTH_LOGOUT, {}, 'missing-account');
      expect(legacyAuth.startCodexOAuthFlow).not.toHaveBeenCalled();
      expect(legacyAuth.getCodexAuthState).not.toHaveBeenCalled();
      expect(legacyAuth.clearCodexAuth).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.APERANT_ENABLE_LEGACY_CODEX_OAUTH;
      else process.env.APERANT_ENABLE_LEGACY_CODEX_OAUTH = previous;
    }
  });
});
