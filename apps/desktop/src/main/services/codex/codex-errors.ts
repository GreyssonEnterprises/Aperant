import type { ModelCatalogErrorCode } from '@shared/types/model-catalog';

const PUBLIC_MESSAGES: Record<ModelCatalogErrorCode, string> = {
  'authentication-required': 'Codex subscription authentication is required',
  'cli-unavailable': 'Codex CLI is unavailable',
  'cli-unsupported': 'The installed Codex CLI version is unsupported',
  'discovery-failed': 'Model discovery failed',
  'isolation-failed': 'Codex account isolation could not be verified',
  'process-exited': 'Codex app-server stopped unexpectedly',
  'protocol-error': 'Codex app-server returned an invalid response',
  'request-timeout': 'Codex app-server request timed out',
  'rpc-error': 'Codex app-server request failed',
  shutdown: 'Codex app-server is shutting down',
  'spawn-failed': 'Codex app-server could not be started',
};

export class CodexRuntimeError extends Error {
  constructor(readonly code: ModelCatalogErrorCode, internalMessage = PUBLIC_MESSAGES[code]) {
    super(internalMessage);
    this.name = 'CodexRuntimeError';
  }

  toJSON(): { code: ModelCatalogErrorCode; message: string } {
    return { code: this.code, message: PUBLIC_MESSAGES[this.code] };
  }
}

export function toPublicCatalogError(error: unknown): {
  code: ModelCatalogErrorCode;
  message: string;
} {
  if (error instanceof CodexRuntimeError) {
    return { code: error.code, message: PUBLIC_MESSAGES[error.code] };
  }
  return { code: 'discovery-failed', message: PUBLIC_MESSAGES['discovery-failed'] };
}
