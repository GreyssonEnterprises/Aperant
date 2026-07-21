import type { BuiltinProvider, ProviderAccount } from './provider-account';

export type ModelThinkingMode =
  | 'none'
  | 'manual'
  | 'adaptive'
  | 'always-adaptive'
  | 'unknown';

export type ModelBackend = 'vercel' | 'codex-app-server';
export type ModelDescriptorSource = 'bundled' | 'provider' | 'custom';
export type ModelAvailability = 'available' | 'unavailable' | 'unverified';

export interface ModelThinkingSupport {
  mode: ModelThinkingMode;
  effortLevels: string[];
}

export interface ModelDescriptor {
  id: string;
  label: string;
  provider: BuiltinProvider;
  authModes: ProviderAccount['authType'][];
  backend: ModelBackend;
  contextWindow?: number;
  maxOutputTokens?: number;
  thinking: ModelThinkingSupport;
  source: ModelDescriptorSource;
  availability: ModelAvailability;
}

export interface CustomModelReference {
  id: string;
  provider: BuiltinProvider;
  label?: string;
}

export interface ModelCatalogSnapshot {
  provider: BuiltinProvider;
  accountId?: string;
  fetchedAt: string;
  sourceVersion?: string;
  models: ModelDescriptor[];
}
