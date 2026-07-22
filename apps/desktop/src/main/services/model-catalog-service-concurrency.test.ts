import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelCatalogSnapshot } from '@shared/types/model-catalog';
import type { ProviderAccount } from '@shared/types/provider-account';

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  readFile: readFileMock,
}));

import { createModelCatalogService } from './model-catalog-service';

describe('model catalog initial cache loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('makes concurrent callers await the same initial cache read', async () => {
    let resolveRead!: (value: string) => void;
    readFileMock.mockReturnValue(new Promise<string>((resolve) => { resolveRead = resolve; }));
    const account: ProviderAccount = {
      id: 'account',
      provider: 'anthropic',
      name: 'Anthropic',
      authType: 'api-key',
      billingModel: 'pay-per-use',
      apiKey: 'secret',
      createdAt: 1,
      updatedAt: 1,
    };
    const snapshot: ModelCatalogSnapshot = {
      provider: 'anthropic',
      accountId: account.id,
      fetchedAt: new Date(1_000).toISOString(),
      models: [{
        id: 'claude-cached',
        label: 'Claude Cached',
        provider: 'anthropic',
        authModes: ['api-key'],
        backend: 'vercel',
        thinking: { mode: 'unknown', effortLevels: [] },
        source: 'provider',
        availability: 'available',
      }],
    };
    const fetch = vi.fn();
    const service = createModelCatalogService({
      cachePath: '/tmp/model-catalog.json',
      fetch,
      now: () => 1_001,
      readAccounts: () => [account],
    });

    const first = service.list({ provider: 'anthropic', accountId: account.id });
    await Promise.resolve();
    const second = service.list({ provider: 'anthropic', accountId: account.id });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    resolveRead(JSON.stringify({ version: 1, snapshots: [snapshot] }));
    const [firstModels, secondModels] = await Promise.all([first, second]);
    expect(firstModels).toEqual(secondModels);
    expect(firstModels.some((model) => model.id === 'claude-cached')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
