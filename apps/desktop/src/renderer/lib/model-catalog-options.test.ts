import { describe, expect, it } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import {
  ensureSavedModelOption,
  groupCatalogModelOptions,
  toCatalogModelOptions,
} from './model-catalog-options';

function descriptor(overrides: Partial<ModelDescriptor> = {}): ModelDescriptor {
  return {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'anthropic',
    authModes: ['api-key'],
    backend: 'vercel',
    contextWindow: 200_000,
    thinking: { mode: 'adaptive', effortLevels: [] },
    source: 'bundled',
    availability: 'available',
    ...overrides,
  };
}

describe('catalog model options', () => {
  it('keeps legacy Anthropic aliases while adding discovered IDs', () => {
    const options = toCatalogModelOptions([
      descriptor(),
      descriptor({ id: 'claude-new', label: 'Claude New', source: 'provider' }),
    ]);

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'opus', provider: 'anthropic' }),
      expect.objectContaining({ value: 'claude-new', provider: 'anthropic' }),
    ]));
  });

  it('groups catalog options by provider', () => {
    const grouped = groupCatalogModelOptions(toCatalogModelOptions([
      descriptor(),
      descriptor({ id: 'gpt-test', label: 'GPT Test', provider: 'openai' }),
    ]));

    expect(grouped.get('anthropic')?.length).toBeGreaterThan(0);
    expect(grouped.get('openai')?.map((model) => model.value)).toContain('gpt-test');
  });

  it('preserves a saved unavailable string as a visible option', () => {
    const options = ensureSavedModelOption([], 'retired-model', 'mistral');

    expect(options).toEqual([expect.objectContaining({
      value: 'retired-model',
      label: 'retired-model',
      provider: 'mistral',
      availability: 'unavailable',
    })]);
  });
});
