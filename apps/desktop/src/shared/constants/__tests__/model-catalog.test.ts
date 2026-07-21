import { describe, expect, it } from 'vitest';

import {
  BUNDLED_MODEL_CATALOG,
  findModelDescriptor,
  getModelCapabilities,
  mergeModelDescriptors,
  parseAnthropicModelList,
} from '../model-catalog';
import type { ModelDescriptor } from '../../types/model-catalog';
import {
  AVAILABLE_MODELS,
  BUNDLED_MODEL_CATALOG as MODELS_MODULE_CATALOG,
  getModelContextWindow,
  getReasoningConfigForModel,
  MODEL_ID_MAP,
} from '../models';

const unknownOpenAiModel: ModelDescriptor = {
  id: 'future-model',
  label: 'Future model',
  provider: 'openai',
  authModes: ['api-key'],
  backend: 'vercel',
  thinking: { mode: 'unknown', effortLevels: [] },
  source: 'provider',
  availability: 'available',
};

describe('BUNDLED_MODEL_CATALOG', () => {
  it.each([
    ['claude-fable-5', 'always-adaptive'],
    ['claude-opus-4-8', 'adaptive'],
    ['claude-sonnet-5', 'adaptive'],
  ] as const)('describes current Claude model %s', (id, thinkingMode) => {
    const model = findModelDescriptor(BUNDLED_MODEL_CATALOG, 'anthropic', id);

    expect(model).toMatchObject({
      id,
      provider: 'anthropic',
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      thinking: { mode: thinkingMode, effortLevels: [] },
    });
  });

  it('retains the concrete Haiku model used by legacy aliases', () => {
    expect(
      findModelDescriptor(
        BUNDLED_MODEL_CATALOG,
        'anthropic',
        'claude-haiku-4-5-20251001',
      ),
    ).toMatchObject({
      label: 'Claude Haiku 4.5',
      thinking: { mode: 'none' },
    });
  });

  it('is re-exported without changing legacy aliases or saved values', () => {
    expect(MODELS_MODULE_CATALOG).toBe(BUNDLED_MODEL_CATALOG);
    expect(AVAILABLE_MODELS.map((model) => model.value)).toEqual([
      'opus',
      'opus-1m',
      'opus-4.5',
      'sonnet',
      'haiku',
    ]);
    expect(MODEL_ID_MAP).toMatchObject({
      opus: 'claude-opus-4-6',
      'opus-1m': 'claude-opus-4-6',
      'opus-4.5': 'claude-opus-4-5-20251101',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    });
    expect(getModelContextWindow('claude-sonnet-5')).toBe(1_000_000);
    expect(
      getReasoningConfigForModel('claude-fable-5', 'anthropic'),
    ).toEqual({ type: 'adaptive_effort', level: 'high' });
  });
});

describe('parseAnthropicModelList', () => {
  it('normalizes known models and conservatively represents unknown models', () => {
    const models = parseAnthropicModelList({
      data: [
        { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
        { id: 'claude-surprise-9', display_name: 'Claude Surprise 9' },
      ],
    });

    expect(models[0]).toMatchObject({
      id: 'claude-sonnet-5',
      source: 'provider',
      availability: 'available',
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      thinking: { mode: 'adaptive' },
    });
    expect(models[1]).toEqual({
      id: 'claude-surprise-9',
      label: 'Claude Surprise 9',
      provider: 'anthropic',
      authModes: ['oauth', 'api-key'],
      backend: 'vercel',
      thinking: { mode: 'unknown', effortLevels: [] },
      source: 'provider',
      availability: 'available',
    });
  });

  it('ignores malformed and duplicate entries without throwing', () => {
    expect(
      parseAnthropicModelList({
        data: [
          null,
          {},
          { id: '  ' },
          { id: 'claude-one', display_name: 42 },
          { id: 'claude-one', display_name: 'Duplicate' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ id: 'claude-one', label: 'claude-one' }),
    ]);
    expect(parseAnthropicModelList({ data: 'not-an-array' })).toEqual([]);
    expect(parseAnthropicModelList(null)).toEqual([]);
  });
});

describe('mergeModelDescriptors', () => {
  it('merges by provider and id while retaining bundled capabilities', () => {
    const bundled = BUNDLED_MODEL_CATALOG.filter(
      (model) => model.id === 'claude-sonnet-5',
    );
    const discovered = parseAnthropicModelList({
      data: [{ id: 'claude-sonnet-5', display_name: 'Sonnet from API' }],
    });

    const merged = mergeModelDescriptors(bundled, discovered);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      label: 'Sonnet from API',
      source: 'provider',
      availability: 'available',
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
    });
  });

  it('does not collapse equal ids from different providers', () => {
    const anthropic = {
      ...unknownOpenAiModel,
      provider: 'anthropic' as const,
    };

    const merged = mergeModelDescriptors(
      [unknownOpenAiModel],
      [anthropic],
    );

    expect(merged.map(({ provider, id }) => [provider, id])).toEqual([
      ['openai', 'future-model'],
      ['anthropic', 'future-model'],
    ]);
  });

  it('adds custom references without inventing capabilities', () => {
    const merged = mergeModelDescriptors(
      BUNDLED_MODEL_CATALOG,
      [],
      [{ id: 'my-private-model', provider: 'openai', label: 'Private' }],
    );
    const custom = findModelDescriptor(
      merged,
      'openai',
      'my-private-model',
    );

    expect(custom).toEqual({
      id: 'my-private-model',
      label: 'Private',
      provider: 'openai',
      authModes: [],
      backend: 'vercel',
      thinking: { mode: 'unknown', effortLevels: [] },
      source: 'custom',
      availability: 'unverified',
    });
    expect(getModelCapabilities(custom)).toEqual({
      thinking: { mode: 'unknown', effortLevels: [] },
    });
  });

  it('keeps a matching custom reference conservative', () => {
    const merged = mergeModelDescriptors(
      BUNDLED_MODEL_CATALOG,
      [],
      [{ id: 'gpt-5.2', provider: 'openai', label: 'My GPT' }],
    );

    expect(findModelDescriptor(merged, 'openai', 'gpt-5.2')).toEqual({
      id: 'gpt-5.2',
      label: 'My GPT',
      provider: 'openai',
      authModes: [],
      backend: 'vercel',
      thinking: { mode: 'unknown', effortLevels: [] },
      source: 'custom',
      availability: 'unverified',
    });
  });

  it('does not mutate its inputs', () => {
    const bundled = Object.freeze([Object.freeze({ ...unknownOpenAiModel })]);
    const discovered = Object.freeze([
      Object.freeze({ ...unknownOpenAiModel, label: 'Discovered' }),
    ]);

    expect(() => mergeModelDescriptors(bundled, discovered)).not.toThrow();
    expect(bundled[0].label).toBe('Future model');
  });
});
