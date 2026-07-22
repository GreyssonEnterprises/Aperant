import { describe, expect, it, vi } from 'vitest';
import { ensureCodexAccountRecord } from './codex-account-onboarding';

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
});
