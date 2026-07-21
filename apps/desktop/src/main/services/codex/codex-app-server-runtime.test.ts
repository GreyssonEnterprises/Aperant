import { describe, expect, it, vi } from 'vitest';
import { handleCodexNotification } from './codex-app-server-runtime';

describe('Codex runtime notifications', () => {
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
});
