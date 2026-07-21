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
export type ModelCatalogErrorCode =
  | 'authentication-required'
  | 'cli-unavailable'
  | 'cli-unsupported'
  | 'discovery-failed'
  | 'isolation-failed'
  | 'process-exited'
  | 'protocol-error'
  | 'request-timeout'
  | 'rpc-error'
  | 'shutdown'
  | 'spawn-failed'
  | 'termination-failed';

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

export interface ModelCatalogQuery {
  provider?: BuiltinProvider;
  accountId?: string;
}

export interface ModelCatalogSnapshotStatus {
  provider: BuiltinProvider;
  accountId?: string;
  fetchedAt: string;
  stale: boolean;
  refreshing: boolean;
  lastErrorCode?: ModelCatalogErrorCode;
  lastError?: string;
}

export interface ModelCatalogStatus {
  snapshots: ModelCatalogSnapshotStatus[];
}
