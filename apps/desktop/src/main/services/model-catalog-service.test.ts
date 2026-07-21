import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@shared/types/provider-account';
import { createModelCatalogService, MODEL_CATALOG_TTL_MS } from './model-catalog-service';

const temporaryDirectories: string[] = [];

async function cachePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aperant-model-catalog-'));
  temporaryDirectories.push(directory);
  return join(directory, 'model-catalog.json');
}

function account(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'anthropic-account',
    provider: 'anthropic',
    name: 'Anthropic',
    authType: 'api-key',
    billingModel: 'pay-per-use',
    apiKey: 'secret-key',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function anthropicResponse(id: string): Response {
  return new Response(JSON.stringify({ data: [{ id, display_name: id }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('model catalog service', () => {
  it('discovers Anthropic models in main and atomically caches them for 24 hours', async () => {
    const path = await cachePath();
    let now = 1_000;
    const fetch = vi.fn(async () => anthropicResponse('claude-discovered'));
    const accounts = [account()];
    const service = createModelCatalogService({
      cachePath: path,
      fetch,
      now: () => now,
      readAccounts: () => accounts,
    });

    const first = await service.list({ provider: 'anthropic', accountId: accounts[0].id });
    now += MODEL_CATALOG_TTL_MS - 1;
    const second = await service.list({ provider: 'anthropic', accountId: accounts[0].id });

    expect(first.find((model) => model.id === 'claude-discovered')).toMatchObject({
      source: 'provider',
      availability: 'available',
    });
    expect(first.find((model) => model.id === 'claude-opus-4-6')).toMatchObject({
      source: 'bundled',
      availability: 'unavailable',
    });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'secret-key',
        }),
      }),
    );
    const cache = await readFile(path, 'utf8');
    expect(cache).not.toContain('secret-key');
  });

  it('keeps snapshots separate per provider account', async () => {
    const path = await cachePath();
    const accounts = [
      account({ id: 'first', apiKey: 'first-secret' }),
      account({ id: 'second', apiKey: 'second-secret' }),
    ];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      return anthropicResponse(headers['x-api-key'] === 'first-secret' ? 'claude-first' : 'claude-second');
    });
    const service = createModelCatalogService({
      cachePath: path,
      fetch,
      now: () => 2_000,
      readAccounts: () => accounts,
    });

    const [first, second] = await Promise.all([
      service.list({ provider: 'anthropic', accountId: 'first' }),
      service.list({ provider: 'anthropic', accountId: 'second' }),
    ]);

    expect(first.some((model) => model.id === 'claude-first')).toBe(true);
    expect(first.some((model) => model.id === 'claude-second')).toBe(false);
    expect(second.some((model) => model.id === 'claude-second')).toBe(true);
  });

  it('coalesces concurrent refreshes and supports invalidation', async () => {
    const path = await cachePath();
    let resolveFetch!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const service = createModelCatalogService({
      cachePath: path,
      fetch,
      now: () => 3_000,
      readAccounts: () => [account()],
    });

    const first = service.refresh({ provider: 'anthropic', accountId: 'anthropic-account' });
    const second = service.refresh({ provider: 'anthropic', accountId: 'anthropic-account' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    resolveFetch(anthropicResponse('claude-shared'));
    expect(await first).toEqual(await second);

    await service.invalidate({ provider: 'anthropic', accountId: 'anthropic-account' });
    expect((await service.status()).snapshots).toEqual([]);
  });

  it('uses bounded exponential backoff then returns bundled fallback', async () => {
    const path = await cachePath();
    const delays: number[] = [];
    const fetch = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const service = createModelCatalogService({
      cachePath: path,
      fetch,
      now: () => 4_000,
      readAccounts: () => [account()],
      sleep: async (delay) => { delays.push(delay); },
    });

    const models = await service.refresh({
      provider: 'anthropic',
      accountId: 'anthropic-account',
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.source === 'bundled')).toBe(true);
    expect(models.every((model) => model.availability === 'unverified')).toBe(true);
    expect((await service.status()).snapshots[0].lastError).toContain('503');
  });

  it('does not retry non-transient authentication failures', async () => {
    const fetch = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const service = createModelCatalogService({
      cachePath: await cachePath(),
      fetch,
      now: () => 4_500,
      readAccounts: () => [account()],
      sleep: vi.fn(async () => undefined),
    });

    await service.refresh({ provider: 'anthropic', accountId: 'anthropic-account' });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('marks OpenAI OAuth subscription models unavailable until Codex support lands', async () => {
    const service = createModelCatalogService({
      cachePath: await cachePath(),
      fetch: vi.fn(),
      now: () => 5_000,
      readAccounts: () => [account({
        id: 'codex-account',
        provider: 'openai',
        authType: 'oauth',
        billingModel: 'subscription',
        apiKey: undefined,
      })],
    });

    const models = await service.list({ provider: 'openai', accountId: 'codex-account' });

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.availability === 'unavailable')).toBe(true);
  });

  it('reports a provider model available when any matching account can use it', async () => {
    const service = createModelCatalogService({
      cachePath: await cachePath(),
      fetch: vi.fn(),
      now: () => 6_000,
      readAccounts: () => [
        account({ id: 'api', provider: 'openai', apiKey: 'openai-key' }),
        account({
          id: 'oauth',
          provider: 'openai',
          authType: 'oauth',
          billingModel: 'subscription',
          apiKey: undefined,
        }),
      ],
    });

    const models = await service.list({ provider: 'openai' });

    expect(models.every((model) => model.availability === 'available')).toBe(true);
  });
});
