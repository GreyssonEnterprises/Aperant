import { readFile } from 'node:fs/promises';
import { BUNDLED_MODEL_CATALOG, mergeModelDescriptors, parseAnthropicModelList } from '@shared/constants/model-catalog';
import type {
  ModelCatalogQuery,
  ModelCatalogSnapshot,
  ModelCatalogStatus,
  ModelDescriptor,
} from '@shared/types/model-catalog';
import type { BuiltinProvider, ProviderAccount } from '@shared/types/provider-account';
import { isCodexSubscriptionModel } from '@shared/utils/model-catalog';
import { writeJsonAtomic } from '../utils/atomic-file';

export const MODEL_CATALOG_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1_000;

interface ModelCatalogCache {
  version: 1;
  snapshots: ModelCatalogSnapshot[];
}

export interface ModelCatalogServiceDependencies {
  cachePath: string;
  fetch: typeof globalThis.fetch;
  now: () => number;
  readAccounts: () => ProviderAccount[] | Promise<ProviderAccount[]>;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface ModelCatalogService {
  list(query?: ModelCatalogQuery): Promise<ModelDescriptor[]>;
  refresh(query?: ModelCatalogQuery): Promise<ModelDescriptor[]>;
  invalidate(query?: ModelCatalogQuery): Promise<void>;
  status(): Promise<ModelCatalogStatus>;
}

interface InFlightRefresh {
  accountId: string;
  generation: number;
  promise: Promise<ModelDescriptor[]>;
  provider: BuiltinProvider;
}

function snapshotKey(provider: BuiltinProvider, accountId?: string): string {
  return `${provider}\u0000${accountId ?? ''}`;
}

function cloneModels(models: readonly ModelDescriptor[]): ModelDescriptor[] {
  return models.map((model) => ({
    ...model,
    authModes: [...model.authModes],
    thinking: { ...model.thinking, effortLevels: [...model.thinking.effortLevels] },
  }));
}

function bundledForAccount(provider: BuiltinProvider, account?: ProviderAccount): ModelDescriptor[] {
  return BUNDLED_MODEL_CATALOG
    .filter((model) => model.provider === provider)
    .map((model) => ({
      ...model,
      authModes: [...model.authModes],
      thinking: { ...model.thinking, effortLevels: [...model.thinking.effortLevels] },
      availability:
        isCodexSubscriptionModel(model) ||
        !account || (provider === 'openai' && account.authType === 'oauth')
          ? 'unavailable'
          : model.authModes.includes(account.authType)
            ? 'available'
            : 'unavailable',
    }));
}

function unavailableBundled(provider: BuiltinProvider): ModelDescriptor[] {
  return bundledForAccount(provider).map((model) => ({ ...model, availability: 'unavailable' }));
}

function isCache(value: unknown): value is ModelCatalogCache {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ModelCatalogCache>;
  return candidate.version === 1 && Array.isArray(candidate.snapshots);
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const AVAILABILITY_RANK = { unavailable: 0, unverified: 1, available: 2 } as const;

function mergeAccountModels(modelLists: readonly ModelDescriptor[][]): ModelDescriptor[] {
  const merged = new Map<string, ModelDescriptor>();
  for (const models of modelLists) {
    for (const candidate of models) {
      const key = snapshotKey(candidate.provider, candidate.id);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, cloneModels([candidate])[0]);
        continue;
      }
      const candidateRank = AVAILABILITY_RANK[candidate.availability];
      const existingRank = AVAILABILITY_RANK[existing.availability];
      const candidatePreferred = candidateRank > existingRank ||
        (candidateRank === existingRank && candidate.source === 'provider');
      const preferred = candidatePreferred ? candidate : existing;
      const other = candidatePreferred ? existing : candidate;
      const combined = mergeModelDescriptors([other], [preferred])[0];
      merged.set(key, {
        ...combined,
        availability: candidateRank > existingRank
          ? candidate.availability
          : existing.availability,
      });
    }
  }
  return [...merged.values()];
}

export function createModelCatalogService(
  dependencies: ModelCatalogServiceDependencies,
): ModelCatalogService {
  const sleep = dependencies.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const snapshots = new Map<string, ModelCatalogSnapshot>();
  const inFlight = new Map<string, InFlightRefresh>();
  const generations = new Map<string, number>();
  const errors = new Map<string, string>();
  let loadPromise: Promise<void> | undefined;
  let saveChain = Promise.resolve();

  async function loadCache(): Promise<void> {
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const parsed: unknown = JSON.parse(await readFile(dependencies.cachePath, 'utf8'));
          if (!isCache(parsed)) return;
          for (const snapshot of parsed.snapshots) {
            snapshots.set(snapshotKey(snapshot.provider, snapshot.accountId), snapshot);
          }
        } catch {
          // A missing or invalid cache is equivalent to an empty cache.
        }
      })();
    }
    await loadPromise;
  }

  async function saveCache(): Promise<void> {
    const cache: ModelCatalogCache = {
      version: 1,
      snapshots: [...snapshots.values()],
    };
    const write = saveChain.then(() => writeJsonAtomic(dependencies.cachePath, cache, {
      mode: 0o600,
    }));
    saveChain = write.catch(() => undefined);
    await write;
  }

  function isFresh(snapshot: ModelCatalogSnapshot): boolean {
    const fetchedAt = Date.parse(snapshot.fetchedAt);
    return Number.isFinite(fetchedAt) && dependencies.now() - fetchedAt < MODEL_CATALOG_TTL_MS;
  }

  async function discoverAnthropic(account: ProviderAccount): Promise<ModelDescriptor[]> {
    if (account.authType !== 'api-key' || !account.apiKey) {
      return bundledForAccount('anthropic', account);
    }

    const baseUrl = (account.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    let lastError = new Error('Anthropic model discovery failed');
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await dependencies.fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': account.apiKey,
          },
        });
        if (!response.ok) {
          const error = new Error(`Anthropic model discovery failed with HTTP ${response.status}`);
          lastError = error;
          if (!isRetryable(response.status)) break;
        } else {
          const discovered = parseAnthropicModelList(await response.json());
          return mergeModelDescriptors(
            unavailableBundled('anthropic'),
            discovered,
            [],
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS));
      }
    }
    throw lastError;
  }

  async function refreshAccount(account: ProviderAccount): Promise<ModelDescriptor[]> {
    const key = snapshotKey(account.provider, account.id);
    const existing = inFlight.get(key);
    const generation = generations.get(key) ?? 0;
    if (existing?.generation === generation) return existing.promise;

    const operation = (async () => {
      let models: ModelDescriptor[];
      let refreshError: string | undefined;
      try {
        models = account.provider === 'anthropic'
          ? await discoverAnthropic(account)
          : bundledForAccount(account.provider, account);
      } catch (error) {
        refreshError = error instanceof Error ? error.message : String(error);
        models = bundledForAccount(account.provider, account).map((model) => ({
          ...model,
          availability: 'unverified',
        }));
      }

      if ((generations.get(key) ?? 0) !== generation) {
        return cloneModels(models);
      }

      if (refreshError) errors.set(key, refreshError);
      else errors.delete(key);
      const previous = snapshots.get(key);
      const snapshot: ModelCatalogSnapshot = {
        provider: account.provider,
        accountId: account.id,
        fetchedAt: refreshError
          ? previous?.fetchedAt ?? new Date(dependencies.now() - MODEL_CATALOG_TTL_MS).toISOString()
          : new Date(dependencies.now()).toISOString(),
        models,
      };
      snapshots.set(key, snapshot);
      await saveCache();
      return cloneModels(models);
    })().finally(() => {
      if (inFlight.get(key)?.promise === operation) {
        inFlight.delete(key);
      }
    });
    inFlight.set(key, {
      accountId: account.id,
      generation,
      promise: operation,
      provider: account.provider,
    });
    return operation;
  }

  async function matchingAccounts(query: ModelCatalogQuery): Promise<ProviderAccount[]> {
    const accounts = await dependencies.readAccounts();
    return accounts.filter((account) =>
      (!query.provider || account.provider === query.provider) &&
      (!query.accountId || account.id === query.accountId));
  }

  async function collect(query: ModelCatalogQuery, force: boolean): Promise<ModelDescriptor[]> {
    await loadCache();
    const accounts = await matchingAccounts(query);
    const accountModels = await Promise.all(accounts.map(async (account) => {
      const cached = snapshots.get(snapshotKey(account.provider, account.id));
      if (!force && cached && isFresh(cached)) return cloneModels(cached.models);
      return refreshAccount(account);
    }));

    const providers = query.provider
      ? [query.provider]
      : [...new Set(BUNDLED_MODEL_CATALOG.map((model) => model.provider))];
    let merged: ModelDescriptor[] = [];
    for (const provider of providers) {
      const perProvider = accountModels.filter((_, index) => accounts[index]?.provider === provider);
      if (perProvider.length === 0) {
        merged = mergeModelDescriptors(merged, unavailableBundled(provider));
        continue;
      }
      merged = mergeModelDescriptors(merged, mergeAccountModels(perProvider));
    }

    for (const account of accounts) {
      if (account.provider !== 'openai-compatible' || !account.customModels) continue;
      merged = mergeModelDescriptors(merged, [], account.customModels.map((model) => ({
        ...model,
        provider: 'openai-compatible',
      })));
    }
    return merged;
  }

  return {
    list: (query = {}) => collect(query, false),
    refresh: (query = {}) => collect(query, true),
    async invalidate(query = {}) {
      await loadCache();
      const invalidatedKeys = new Set<string>();
      for (const [key, snapshot] of snapshots) {
        if ((!query.provider || snapshot.provider === query.provider) &&
            (!query.accountId || snapshot.accountId === query.accountId)) {
          snapshots.delete(key);
          errors.delete(key);
          invalidatedKeys.add(key);
        }
      }
      for (const [key, refresh] of inFlight) {
        if ((!query.provider || refresh.provider === query.provider) &&
            (!query.accountId || refresh.accountId === query.accountId)) {
          inFlight.delete(key);
          errors.delete(key);
          invalidatedKeys.add(key);
        }
      }
      for (const key of invalidatedKeys) {
        generations.set(key, (generations.get(key) ?? 0) + 1);
      }
      await saveCache();
    },
    async status() {
      await loadCache();
      return {
        snapshots: [...snapshots.entries()].map(([key, snapshot]) => ({
          provider: snapshot.provider,
          ...(snapshot.accountId ? { accountId: snapshot.accountId } : {}),
          fetchedAt: snapshot.fetchedAt,
          stale: !isFresh(snapshot),
          refreshing: inFlight.has(key),
          ...(errors.has(key) ? { lastError: errors.get(key) } : {}),
        })),
      };
    },
  };
}
