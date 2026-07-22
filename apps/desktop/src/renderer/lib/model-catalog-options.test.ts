import { describe, expect, it } from 'vitest';
import type { ModelDescriptor } from '@shared/types/model-catalog';
import {
  appendOllamaModelOptions,
  ensureSavedModelOption,
  groupCatalogModelOptions,
  resolveSavedModelProvider,
  toCatalogModelOptions,
} from './model-catalog-options';

function descriptor(overrides: Partial<ModelDescriptor> = {}): ModelDescriptor {
  return {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
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
  it('shows only current Anthropic aliases from provider discovery', () => {
    const options = toCatalogModelOptions([
      descriptor(),
      descriptor({ id: 'claude-new', label: 'Claude New', source: 'provider' }),
    ]);

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'opus', provider: 'anthropic' }),
    ]));
    expect(options.some((option) => option.value === 'claude-new')).toBe(false);
  });

  it('preserves context, default, and effort metadata for Codex models', () => {
    const options = toCatalogModelOptions([descriptor({
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      provider: 'openai',
      authModes: ['oauth'],
      backend: 'codex-app-server',
      contextWindow: 1_000_000,
      isDefault: true,
      thinking: {
        mode: 'manual',
        defaultEffort: 'low',
        effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    })]);

    expect(options.find((option) => option.value === 'gpt-5.6-sol')).toMatchObject({
      isDefault: true,
      capabilities: { contextWindow: 1_000_000 },
      thinking: {
        defaultEffort: 'low',
        effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    });
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

  it('gates bundled Codex models until Task 3', () => {
    const options = toCatalogModelOptions([descriptor({
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      provider: 'openai',
      authModes: ['oauth', 'api-key'],
      availability: 'available',
    })]);

    expect(options.find((option) => option.value === 'gpt-5.3-codex')).toMatchObject({
      availability: 'unavailable',
    });
  });

  it('uses the explicit saved provider for uncatalogued values', () => {
    expect(resolveSavedModelProvider([], 'private-model', 'groq')).toBe('groq');
  });

  it('appends installed Ollama models without dropping a saved unavailable fallback', () => {
    const saved = ensureSavedModelOption([], 'removed:latest', 'ollama');
    const installed = [{
      value: 'llama:latest',
      label: 'llama:latest',
      provider: 'ollama' as const,
      availability: 'available' as const,
    }];

    expect(appendOllamaModelOptions(saved, installed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'removed:latest', availability: 'unavailable' }),
      expect.objectContaining({ value: 'llama:latest', availability: 'available' }),
    ]));
  });
});
