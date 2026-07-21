/**
 * Pinned stable Codex app-server protocol subset for codex-cli 0.144.x.
 * Unknown fields are intentionally tolerated for forward compatibility.
 */

export interface CodexInitializeParams {
  clientInfo: { name: string; title?: string; version: string };
  capabilities: { experimentalApi: boolean; requestAttestation: boolean };
}

export interface CodexInitializeResponse {
  codexHome: string;
  platformFamily: string;
  platformOs: string;
  userAgent: string;
}

export type CodexAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: string }
  | { type: 'amazonBedrock'; credentialSource?: string };

export interface CodexAccountReadResponse {
  account?: CodexAccount | null;
  requiresOpenaiAuth: boolean;
}

export type CodexLoginStartParams =
  | { type: 'chatgpt'; appBrand?: 'codex' | 'chatgpt'; codexStreamlinedLogin?: boolean }
  | { type: 'chatgptDeviceCode' };

export type CodexLoginStartResponse =
  | { type: 'chatgpt'; loginId: string; authUrl: string }
  | {
      type: 'chatgptDeviceCode';
      loginId: string;
      userCode: string;
      verificationUrl: string;
    };

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
}

export interface CodexModelListParams {
  cursor?: string | null;
  includeHidden?: boolean | null;
  limit?: number | null;
}

export interface CodexModelListResponse {
  data: CodexModel[];
  nextCursor?: string | null;
}

export interface CodexClientRequestMap {
  initialize: { params: CodexInitializeParams; response: CodexInitializeResponse };
  'account/read': { params: { refreshToken: boolean }; response: CodexAccountReadResponse };
  'account/login/start': { params: CodexLoginStartParams; response: CodexLoginStartResponse };
  'model/list': { params: CodexModelListParams; response: CodexModelListResponse };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

export function parseInitializeResponse(value: unknown): CodexInitializeResponse | null {
  if (!isRecord(value) || !hasStrings(value, [
    'codexHome', 'platformFamily', 'platformOs', 'userAgent',
  ])) return null;
  return value as unknown as CodexInitializeResponse;
}

export function parseAccountReadResponse(value: unknown): CodexAccountReadResponse | null {
  if (!isRecord(value) || typeof value.requiresOpenaiAuth !== 'boolean') return null;
  if (value.account !== undefined && value.account !== null) {
    if (!isRecord(value.account) || typeof value.account.type !== 'string') return null;
    if (!['apiKey', 'chatgpt', 'amazonBedrock'].includes(value.account.type)) return null;
    if (value.account.type === 'chatgpt' && (
      !('email' in value.account) ||
      (value.account.email !== null && typeof value.account.email !== 'string') ||
      typeof value.account.planType !== 'string'
    )) return null;
  }
  return value as unknown as CodexAccountReadResponse;
}

export function parseLoginStartResponse(value: unknown): CodexLoginStartResponse | null {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.loginId !== 'string') {
    return null;
  }
  if (value.type === 'chatgpt' && typeof value.authUrl === 'string') {
    return value as unknown as CodexLoginStartResponse;
  }
  if (
    value.type === 'chatgptDeviceCode' &&
    typeof value.userCode === 'string' &&
    typeof value.verificationUrl === 'string'
  ) return value as unknown as CodexLoginStartResponse;
  return null;
}

export function parseModelListResponse(value: unknown): CodexModelListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  if (value.nextCursor !== undefined && value.nextCursor !== null &&
      typeof value.nextCursor !== 'string') return null;
  for (const model of value.data) {
    if (!isRecord(model) || !hasStrings(model, [
      'id',
      'model',
      'displayName',
      'description',
      'defaultReasoningEffort',
    ]) || typeof model.hidden !== 'boolean' || typeof model.isDefault !== 'boolean' ||
      !Array.isArray(model.supportedReasoningEfforts)) return null;
    for (const effort of model.supportedReasoningEfforts) {
      if (!isRecord(effort) || !hasStrings(effort, ['reasoningEffort', 'description'])) {
        return null;
      }
    }
  }
  return value as unknown as CodexModelListResponse;
}
