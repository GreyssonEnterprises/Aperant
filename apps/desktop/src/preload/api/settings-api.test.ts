import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import { createSettingsAPI } from './settings-api';

describe('Codex authentication preload boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only an account identifier for auth operations', async () => {
    const api = createSettingsAPI();
    await api.codexAuthLogin('account-a');
    await api.codexAuthStatus('account-a');
    await api.codexAuthLogout('account-a');
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1, IPC_CHANNELS.CODEX_AUTH_LOGIN, 'account-a',
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2, IPC_CHANNELS.CODEX_AUTH_STATUS, 'account-a',
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      3, IPC_CHANNELS.CODEX_AUTH_LOGOUT, 'account-a',
    );
  });

  it('subscribes to redacted account status and removes the exact listener', () => {
    const api = createSettingsAPI();
    const callback = vi.fn();
    const unsubscribe = api.onCodexAuthChanged(callback);
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      IPC_CHANNELS.CODEX_AUTH_CHANGED,
      expect.any(Function),
    );
    const handler = vi.mocked(ipcRenderer.on).mock.calls[0]?.[1] as (
      event: unknown,
      data: { accountId: string; loginId: string; success: boolean; status: 'authenticated' },
    ) => void;
    handler({}, {
      accountId: 'account-a', loginId: 'login-1', success: true, status: 'authenticated',
    });
    expect(callback).toHaveBeenCalledWith({
      accountId: 'account-a', loginId: 'login-1', success: true, status: 'authenticated',
    });
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.CODEX_AUTH_CHANGED,
      handler,
    );
  });
});
