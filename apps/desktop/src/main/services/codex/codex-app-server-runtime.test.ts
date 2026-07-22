import { beforeEach, describe, expect, it, vi } from 'vitest';

const createManager = vi.hoisted(() => vi.fn());

vi.mock('./codex-app-server-manager', async (importOriginal) => ({
  ...await importOriginal<typeof import('./codex-app-server-manager')>(),
  createCodexAppServerManager: createManager,
}));

import {
  getCodexAppServerManager,
  handleCodexNotification,
  resetCodexAppServerRuntimeForTests,
  shutdownCodexAppServerRuntime,
  subscribeCodexAccountNotifications,
} from './codex-app-server-runtime';

describe('Codex runtime notifications', () => {
  beforeEach(() => {
    resetCodexAppServerRuntimeForTests();
    createManager.mockReset();
  });

  it.each(['account/updated', 'account/login/completed'])(
    'invalidates the owning account catalog for %s',
    async (method) => {
      const invalidate = vi.fn(async () => undefined);

      await handleCodexNotification('account-a', method, {}, invalidate);

      expect(invalidate).toHaveBeenCalledWith({ provider: 'openai', accountId: 'account-a' });
    },
  );

  it('ignores notifications unrelated to model authentication', async () => {
    const invalidate = vi.fn(async () => undefined);

    await handleCodexNotification('account-a', 'thread/started', {}, invalidate);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('publishes typed account-scoped login completions without raw parameters', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCodexAccountNotifications(listener);

    await handleCodexNotification('account-a', 'account/login/completed', {
      loginId: 'login-1',
      success: true,
      accessToken: 'never-forward-this',
    }, vi.fn(async () => undefined));

    expect(listener).toHaveBeenCalledWith({
      accountId: 'account-a', loginId: 'login-1', success: true,
    });
    expect(JSON.stringify(listener.mock.calls)).not.toContain('never-forward-this');
    unsubscribe();
  });

  it('does not publish account updates or uncorrelatable login completions as auth success', async () => {
    const listener = vi.fn();
    subscribeCodexAccountNotifications(listener);

    await handleCodexNotification('account-a', 'account/updated', {
      authMode: 'chatgpt',
    }, vi.fn(async () => undefined));
    await handleCodexNotification('account-a', 'account/login/completed', {
      loginId: null, success: true,
    }, vi.fn(async () => undefined));

    expect(listener).not.toHaveBeenCalled();
  });

  it('cannot recreate the singleton once shutdown begins', async () => {
    let releaseShutdown: (() => void) | undefined;
    const shutdownReleased = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    const runtimeManager = {
      readAccount: vi.fn(),
      startLogin: vi.fn(),
      listModels: vi.fn(),
      shutdown: vi.fn(() => shutdownReleased),
    };
    createManager.mockReturnValue(runtimeManager);

    expect(getCodexAppServerManager()).toBe(runtimeManager);
    const shutdown = shutdownCodexAppServerRuntime();

    expect(() => getCodexAppServerManager()).toThrow(expect.objectContaining({ code: 'shutdown' }));
    expect(createManager).toHaveBeenCalledTimes(1);
    releaseShutdown?.();
    await shutdown;
    expect(() => getCodexAppServerManager()).toThrow(expect.objectContaining({ code: 'shutdown' }));
    expect(createManager).toHaveBeenCalledTimes(1);
  });
});
