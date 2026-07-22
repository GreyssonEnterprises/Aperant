import { describe, expect, it, vi } from 'vitest';
import {
  ensureCodexAccountRecord,
  matchesCodexAuthCompletion,
  recordAndConsumeCodexCompletion,
} from './codex-account-onboarding';

describe('Codex account-first onboarding', () => {
  it('reuses the retained account when browser login is retried', async () => {
    const add = vi.fn();
    const update = vi.fn();
    await expect(ensureCodexAccountRecord({
      retainedAccountId: 'account-a',
      name: 'My Codex',
      add,
      update,
    })).resolves.toEqual({ success: true, accountId: 'account-a' });
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('persists a new subscription account before returning its login scope', async () => {
    const add = vi.fn().mockResolvedValue({ success: true, data: { id: 'account-new' } });
    await expect(ensureCodexAccountRecord({
      name: 'My Codex', add, update: vi.fn(),
    })).resolves.toEqual({ success: true, accountId: 'account-new' });
    expect(add).toHaveBeenCalledWith({
      provider: 'openai', name: 'My Codex', authType: 'oauth', billingModel: 'subscription',
    });
  });

  it('retains an edited account ID after its safe metadata update', async () => {
    const update = vi.fn().mockResolvedValue({ success: true, data: { id: 'account-edit' } });
    await expect(ensureCodexAccountRecord({
      editAccountId: 'account-edit', name: 'Renamed', add: vi.fn(), update,
    })).resolves.toEqual({ success: true, accountId: 'account-edit' });
    expect(update).toHaveBeenCalledWith('account-edit', { name: 'Renamed' });
  });

  it('matches reauthentication only by the exact account and latest login ID', () => {
    const event = {
      accountId: 'account-a', loginId: 'login-2', success: true,
      status: 'authenticated' as const,
    };
    expect(matchesCodexAuthCompletion(event, 'account-a', 'login-2')).toBe(true);
    expect(matchesCodexAuthCompletion(event, 'account-a', 'login-1')).toBe(false);
    expect(matchesCodexAuthCompletion(event, 'account-b', 'login-2')).toBe(false);
    expect(matchesCodexAuthCompletion(event, 'account-a', null)).toBe(false);
  });

  it('records the login synchronously before consuming a completion missed by the event path', async () => {
    const pending = new Map<string, string>();
    const completion = {
      accountId: 'account-a', loginId: 'login-1', success: true,
      status: 'authenticated' as const,
    };
    const handled = vi.fn();
    const eventHandler = (event: typeof completion) => {
      if (matchesCodexAuthCompletion(event, event.accountId,
        pending.get(event.accountId) ?? null)) handled(event);
    };

    eventHandler(completion); // Event arrived after invoke resolved but before renderer recorded ID.
    expect(handled).not.toHaveBeenCalled();
    await recordAndConsumeCodexCompletion({
      accountId: 'account-a',
      loginId: 'login-1',
      pending,
      consume: vi.fn().mockResolvedValue({ success: true, data: completion }),
      onCompletion: handled,
    });
    expect(handled).toHaveBeenCalledOnce();
  });

  it('does not process consume replay after the live event already acknowledged the attempt', async () => {
    const pending = new Map<string, string>();
    const completion = {
      accountId: 'account-a', loginId: 'login-1', success: true,
      status: 'authenticated' as const,
    };
    const handled = vi.fn((_event: typeof completion) => {
      pending.delete('account-a');
    });
    await recordAndConsumeCodexCompletion({
      accountId: 'account-a',
      loginId: 'login-1',
      pending,
      consume: async () => {
        handled(completion); // Live event wins while consume is in flight.
        return { success: true, data: completion };
      },
      onCompletion: handled,
    });
    expect(handled).toHaveBeenCalledOnce();
  });
});
