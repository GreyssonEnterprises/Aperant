import {
  ALL_AVAILABLE_MODELS,
  MODEL_ID_MAP,
  type ModelOption,
} from '@shared/constants/models';
import type { ModelAvailability, ModelDescriptor } from '@shared/types/model-catalog';
import type { BuiltinProvider } from '@shared/types/provider-account';
import { isCodexSubscriptionModel } from '@shared/utils/model-catalog';

export interface CatalogModelOption extends ModelOption {
  availability: ModelAvailability;
  accountId?: string;
}

function descriptorToOption(descriptor: ModelDescriptor): CatalogModelOption {
  const deferredCodex = descriptor.source === 'bundled' && isCodexSubscriptionModel(descriptor);
  return {
    value: descriptor.id,
    label: descriptor.label,
    provider: descriptor.provider,
    availability: deferredCodex ? 'unavailable' : descriptor.availability,
    capabilities: {
      thinking: descriptor.thinking.mode !== 'none' && descriptor.thinking.mode !== 'unknown',
      tools: true,
      vision: false,
      contextWindow: descriptor.contextWindow ?? 200_000,
    },
  };
}

export function toCatalogModelOptions(
  descriptors: readonly ModelDescriptor[],
): CatalogModelOption[] {
  const options: CatalogModelOption[] = [];
  const keys = new Set<string>();
  const add = (option: CatalogModelOption): void => {
    const key = `${option.provider}\u0000${option.value}`;
    if (keys.has(key)) return;
    keys.add(key);
    options.push(option);
  };

  for (const legacy of ALL_AVAILABLE_MODELS) {
    const descriptorId = legacy.provider === 'anthropic'
      ? MODEL_ID_MAP[legacy.value] ?? legacy.value
      : legacy.value;
    const descriptor = descriptors.find((candidate) =>
      candidate.provider === legacy.provider && candidate.id === descriptorId);
    if (!descriptor) continue;
    add({
      ...legacy,
      label: descriptor.label || legacy.label,
      availability: descriptorToOption(descriptor).availability,
      capabilities: legacy.capabilities ?? descriptorToOption(descriptor).capabilities,
    });
  }

  const aliasedAnthropicIds = new Set(Object.values(MODEL_ID_MAP));
  for (const descriptor of descriptors) {
    if (descriptor.provider === 'anthropic' &&
        descriptor.source === 'bundled' &&
        aliasedAnthropicIds.has(descriptor.id)) {
      continue;
    }
    add(descriptorToOption(descriptor));
  }
  return options;
}

export function ensureSavedModelOption(
  options: readonly CatalogModelOption[],
  value: string,
  provider: BuiltinProvider = 'anthropic',
): CatalogModelOption[] {
  if (!value || options.some((option) => option.value === value && option.provider === provider)) {
    return [...options];
  }
  return [...options, {
    value,
    label: value,
    provider,
    availability: 'unavailable',
  }];
}

export function groupCatalogModelOptions(
  options: readonly CatalogModelOption[],
): Map<BuiltinProvider, CatalogModelOption[]> {
  const grouped = new Map<BuiltinProvider, CatalogModelOption[]>();
  for (const option of options) {
    const models = grouped.get(option.provider) ?? [];
    models.push(option);
    grouped.set(option.provider, models);
  }
  return grouped;
}

export function resolveSavedModelProvider(
  options: readonly CatalogModelOption[],
  value: string,
  explicitProvider?: BuiltinProvider,
): BuiltinProvider {
  return explicitProvider ?? options.find((option) => option.value === value)?.provider ?? 'anthropic';
}

export function appendOllamaModelOptions(
  savedOptions: readonly CatalogModelOption[],
  installedOptions: readonly CatalogModelOption[],
): CatalogModelOption[] {
  const installedIds = new Set(installedOptions.map((option) => option.value));
  return [
    ...installedOptions,
    ...savedOptions.filter((option) => !installedIds.has(option.value)),
  ];
}
