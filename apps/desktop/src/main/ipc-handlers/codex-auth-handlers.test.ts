import { describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@shared/types/provider-account';
import { createCodexAuthHandlers } from './codex-auth-handlers';

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
  const handlers = createCodexAuthHandlers({
    getManager: () => manager,
    readAccounts: () => [account],
    openExternal,
  });
  return { handlers, manager, openExternal };
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
});
