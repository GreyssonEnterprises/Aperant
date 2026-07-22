import type { BuiltinProvider, ProviderAccount } from '../types/provider-account';
import type {
  CustomModelReference,
  ModelBackend,
  ModelDescriptor,
  ModelThinkingMode,
} from '../types/model-catalog';

const OAUTH_AND_API_KEY: ProviderAccount['authType'][] = ['oauth', 'api-key'];
const API_KEY_ONLY: ProviderAccount['authType'][] = ['api-key'];

interface BundledModelDefinition {
  id: string;
  label: string;
  provider: BuiltinProvider;
  authModes?: ProviderAccount['authType'][];
  backend?: ModelBackend;
  contextWindow?: number;
  maxOutputTokens?: number;
  thinking?: ModelThinkingMode;
  effortLevels?: string[];
  defaultEffort?: string;
  isDefault?: boolean;
}

function bundledModel(definition: BundledModelDefinition): ModelDescriptor {
  return {
    id: definition.id,
    label: definition.label,
    provider: definition.provider,
    authModes: [...(definition.authModes ?? API_KEY_ONLY)],
    backend: definition.backend ?? 'vercel',
    ...(definition.contextWindow === undefined
      ? {}
      : { contextWindow: definition.contextWindow }),
    ...(definition.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: definition.maxOutputTokens }),
    thinking: {
      mode: definition.thinking ?? 'none',
      effortLevels: [...(definition.effortLevels ?? [])],
      ...(definition.defaultEffort === undefined
        ? {}
        : { defaultEffort: definition.defaultEffort }),
    },
    ...(definition.isDefault === undefined ? {} : { isDefault: definition.isDefault }),
    source: 'bundled',
    availability: 'unverified',
  };
}

export const BUNDLED_MODEL_CATALOG: ModelDescriptor[] = [
  bundledModel({
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    provider: 'anthropic',
    authModes: OAUTH_AND_API_KEY,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    thinking: 'always-adaptive',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  }),
  bundledModel({
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    authModes: OAUTH_AND_API_KEY,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    thinking: 'adaptive',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  }),
  bundledModel({
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    authModes: OAUTH_AND_API_KEY,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    thinking: 'adaptive',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  }),
  bundledModel({
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    provider: 'openai',
    authModes: OAUTH_AND_API_KEY,
    backend: 'codex-app-server',
    contextWindow: 1_000_000,
    thinking: 'manual',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'low',
    isDefault: true,
  }),
  bundledModel({
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    provider: 'openai',
    contextWindow: 400_000,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'openai',
    contextWindow: 400_000,
  }),
  bundledModel({
    id: 'o3',
    label: 'o3',
    provider: 'openai',
    contextWindow: 200_000,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'o4-mini',
    label: 'o4 Mini',
    provider: 'openai',
    contextWindow: 200_000,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1_048_576,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1_048_576,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    provider: 'google',
    contextWindow: 1_048_576,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1_048_576,
  }),
  bundledModel({
    id: 'mistral-large-latest',
    label: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'mistral-small-latest',
    label: 'Mistral Small',
    provider: 'mistral',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'meta-llama/llama-4-maverick',
    label: 'LLaMA 4 Maverick',
    provider: 'groq',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'llama-3.3-70b-versatile',
    label: 'LLaMA 3.3 70B',
    provider: 'groq',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'grok-4-0709',
    label: 'Grok 4',
    provider: 'xai',
    contextWindow: 256_000,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'grok-3',
    label: 'Grok 3',
    provider: 'xai',
    contextWindow: 131_072,
  }),
  bundledModel({
    id: 'grok-3-mini',
    label: 'Grok 3 Mini',
    provider: 'xai',
    contextWindow: 131_072,
    thinking: 'manual',
  }),
  bundledModel({
    id: 'glm-5',
    label: 'GLM-5',
    provider: 'zai',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'glm-4.7',
    label: 'GLM-4.7',
    provider: 'zai',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'glm-4.6v',
    label: 'GLM-4.6V',
    provider: 'zai',
    contextWindow: 128_000,
  }),
  bundledModel({
    id: 'glm-4.5-flash',
    label: 'GLM-4.5 Flash',
    provider: 'zai',
    contextWindow: 128_000,
  }),
];

function descriptorKey(provider: BuiltinProvider, id: string): string {
  return `${provider}\u0000${id}`;
}

function copyDescriptor(descriptor: ModelDescriptor): ModelDescriptor {
  return {
    ...descriptor,
    authModes: [...descriptor.authModes],
    thinking: {
      ...descriptor.thinking,
      effortLevels: [...descriptor.thinking.effortLevels],
    },
  };
}

export function findModelDescriptor(
  descriptors: readonly ModelDescriptor[],
  provider: BuiltinProvider,
  id: string,
): ModelDescriptor | undefined {
  return descriptors.find(
    (descriptor) => descriptor.provider === provider && descriptor.id === id,
  );
}

export function findModelDescriptorById(
  descriptors: readonly ModelDescriptor[],
  id: string,
): ModelDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === id);
}

export function getBundledModelDescriptor(
  provider: BuiltinProvider,
  id: string,
): ModelDescriptor | undefined {
  return findModelDescriptor(BUNDLED_MODEL_CATALOG, provider, id);
}

export function getModelCapabilities(
  descriptor: ModelDescriptor | undefined,
): Pick<ModelDescriptor, 'contextWindow' | 'maxOutputTokens' | 'thinking'> {
  if (!descriptor) {
    return { thinking: { mode: 'unknown', effortLevels: [] } };
  }

  return {
    ...(descriptor.contextWindow === undefined
      ? {}
      : { contextWindow: descriptor.contextWindow }),
    ...(descriptor.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: descriptor.maxOutputTokens }),
    thinking: {
      ...descriptor.thinking,
      effortLevels: [...descriptor.thinking.effortLevels],
    },
  };
}

export function mergeModelDescriptors(
  bundled: readonly ModelDescriptor[],
  discovered: readonly ModelDescriptor[],
  customModels: readonly CustomModelReference[] = [],
): ModelDescriptor[] {
  const merged: ModelDescriptor[] = [];
  const indexes = new Map<string, number>();

  const upsert = (descriptor: ModelDescriptor): void => {
    const key = descriptorKey(descriptor.provider, descriptor.id);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(copyDescriptor(descriptor));
      return;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = copyDescriptor({
      ...existing,
      ...descriptor,
      contextWindow: descriptor.contextWindow ?? existing.contextWindow,
      maxOutputTokens: descriptor.maxOutputTokens ?? existing.maxOutputTokens,
      thinking:
        descriptor.thinking.mode === 'unknown'
          ? existing.thinking
          : descriptor.thinking,
    });
  };

  for (const descriptor of bundled) upsert(descriptor);
  for (const descriptor of discovered) upsert(descriptor);

  for (const custom of customModels) {
    const key = descriptorKey(custom.provider, custom.id);
    const existingIndex = indexes.get(key);
    const descriptor: ModelDescriptor = {
      id: custom.id,
      label: custom.label ?? custom.id,
      provider: custom.provider,
      authModes: [],
      backend: 'vercel',
      thinking: { mode: 'unknown', effortLevels: [] },
      source: 'custom',
      availability: 'unverified',
    };

    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(descriptor);
    } else {
      merged[existingIndex] = descriptor;
    }
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseAnthropicModelList(payload: unknown): ModelDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];

  const models: ModelDescriptor[] = [];
  const seen = new Set<string>();
  for (const entry of payload.data) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const id = entry.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const known = getBundledModelDescriptor('anthropic', id);
    const label =
      typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : known?.label ?? id;

    models.push({
      ...(known ? copyDescriptor(known) : {}),
      id,
      label,
      provider: 'anthropic',
      authModes: [...OAUTH_AND_API_KEY],
      backend: 'vercel',
      thinking: known?.thinking
        ? {
            ...known.thinking,
            effortLevels: [...known.thinking.effortLevels],
          }
        : { mode: 'unknown', effortLevels: [] },
      source: 'provider',
      availability: 'available',
    });
  }

  return models;
}
