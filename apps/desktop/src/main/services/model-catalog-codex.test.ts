import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import type { ProviderAccount } from '@shared/types/provider-account';
import { createModelCatalogService } from './model-catalog-service';

const subscriptionAccount: ProviderAccount = {
  id: 'openai-subscription-a',
  provider: 'openai',
  name: 'Codex subscription',
  authType: 'oauth',
  billingModel: 'subscription',
  createdAt: 1,
  updatedAt: 1,
};

const discovered: ModelDescriptor[] = [{
  id: 'gpt-5.6-codex',
  label: 'GPT-5.6 Codex',
  provider: 'openai',
  authModes: ['oauth'],
  backend: 'codex-app-server',
  thinking: { mode: 'manual', effortLevels: ['low', 'medium'] },
  source: 'provider',
  availability: 'available',
}];

async function cachePath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'aperant-codex-catalog-')), 'catalog.json');
}

describe('Codex model catalog discovery', () => {
  it('publishes authenticated validated app-server models for the account', async () => {
    const discoverCodexModels = vi.fn(async () => discovered);
    const service = createModelCatalogService({
      cachePath: await cachePath(),
      fetch: vi.fn(),
      now: () => 1_000,
      readAccounts: () => [subscriptionAccount],
      discoverCodexModels,
    });

    const models = await service.refresh({ provider: 'openai', accountId: subscriptionAccount.id });

    expect(discoverCodexModels).toHaveBeenCalledWith(subscriptionAccount);
    expect(models).toContainEqual(discovered[0]);
  });

  it('fails closed when Codex runtime validation or authentication fails', async () => {
    const service = createModelCatalogService({
      cachePath: await cachePath(),
      fetch: vi.fn(),
      now: () => 1_000,
      readAccounts: () => [subscriptionAccount],
      discoverCodexModels: async () => {
        throw new Error('Codex subscription account is not authenticated');
      },
    });

    const models = await service.refresh({ provider: 'openai', accountId: subscriptionAccount.id });

    expect(models.filter((model) => model.backend === 'codex-app-server')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'unavailable' }),
      ]),
    );
    expect(models.filter((model) => model.backend === 'codex-app-server')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'unverified' }),
      ]),
    );
  });

  it('revalidates a persisted Codex snapshot before exposing it after restart', async () => {
    const persistedCache = await cachePath();
    const initial = createModelCatalogService({
      cachePath: persistedCache,
      fetch: vi.fn(),
      now: () => 1_000,
      readAccounts: () => [subscriptionAccount],
      discoverCodexModels: async () => discovered,
    });
    await initial.refresh({ provider: 'openai', accountId: subscriptionAccount.id });
    const discoverAfterRestart = vi.fn(async () => {
      throw new Error('Codex authentication expired');
    });
    const restarted = createModelCatalogService({
      cachePath: persistedCache,
      fetch: vi.fn(),
      now: () => 1_001,
      readAccounts: () => [subscriptionAccount],
      discoverCodexModels: discoverAfterRestart,
    });

    const models = await restarted.list({
      provider: 'openai',
      accountId: subscriptionAccount.id,
    });

    expect(discoverAfterRestart).toHaveBeenCalledOnce();
    expect(models.filter((model) => model.backend === 'codex-app-server')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'available' }),
      ]),
    );
  });
});
