/**
 * Pinned stable Codex app-server protocol subset for codex-cli 0.144.x.
 * Unknown fields are intentionally tolerated for forward compatibility.
 */
import type { CodexWorkspaceWritePolicy } from './codex-sandbox-policy';

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

export interface CodexLoginCompletedNotification {
  loginId: string;
  success: boolean;
}

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

export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export interface CodexThreadStartParams {
  cwd: string;
  runtimeWorkspaceRoots: string[];
  model: string;
  developerInstructions: string;
  approvalPolicy: 'never';
  sandbox: 'workspace-write';
  config: { sandbox_workspace_write: { network_access: false } };
}

export interface CodexThreadResumeParams {
  threadId: string;
  cwd: string;
  runtimeWorkspaceRoots: string[];
  model: string;
  developerInstructions: string;
  approvalPolicy: 'never';
  sandbox: 'workspace-write';
  config: { sandbox_workspace_write: { network_access: false } };
}

export interface CodexThreadResponse {
  thread: { id: string };
}

export interface CodexTurnStartParams {
  threadId: string;
  input: Array<{ type: 'text'; text: string; text_elements: [] }>;
  cwd: string;
  model: string;
  runtimeWorkspaceRoots: string[];
  effort?: string;
  outputSchema?: unknown;
  approvalPolicy: 'never';
  sandboxPolicy: CodexWorkspaceWritePolicy;
}

export interface CodexTurnStartResponse {
  turn: { id: string; status: CodexTurnStatus };
}

export interface CodexTurnInterruptParams {
  threadId: string;
  turnId: string;
}

export interface CodexCommandExecParams {
  command: string[];
  cwd: string;
  timeoutMs: number;
  outputBytesCap: number;
  sandboxPolicy: CodexWorkspaceWritePolicy;
}

export interface CodexCommandExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexClientRequestMap {
  initialize: { params: CodexInitializeParams; response: CodexInitializeResponse };
  'account/read': { params: { refreshToken: boolean }; response: CodexAccountReadResponse };
  'account/login/start': { params: CodexLoginStartParams; response: CodexLoginStartResponse };
  'model/list': { params: CodexModelListParams; response: CodexModelListResponse };
  'thread/start': { params: CodexThreadStartParams; response: CodexThreadResponse };
  'thread/resume': { params: CodexThreadResumeParams; response: CodexThreadResponse };
  'turn/start': { params: CodexTurnStartParams; response: CodexTurnStartResponse };
  'turn/interrupt': { params: CodexTurnInterruptParams; response: Record<string, never> };
  'command/exec': { params: CodexCommandExecParams; response: CodexCommandExecResponse };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function hasNonEmptyStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string' && value[key].trim().length > 0);
}

function isSafeLoginUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseInitializeResponse(value: unknown): CodexInitializeResponse | null {
  if (!isRecord(value) || !hasNonEmptyStrings(value, [
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
      typeof value.account.planType !== 'string' || value.account.planType.trim().length === 0
    )) return null;
    if (value.account.type === 'amazonBedrock' &&
      value.account.credentialSource !== undefined &&
      (typeof value.account.credentialSource !== 'string' ||
        value.account.credentialSource.trim().length === 0)) return null;
  }
  return value as unknown as CodexAccountReadResponse;
}

export function parseLoginStartResponse(value: unknown): CodexLoginStartResponse | null {
  if (!isRecord(value) || typeof value.type !== 'string' ||
      !hasNonEmptyStrings(value, ['loginId'])) {
    return null;
  }
  if (value.type === 'chatgpt' && isSafeLoginUrl(value.authUrl)) {
    return value as unknown as CodexLoginStartResponse;
  }
  if (
    value.type === 'chatgptDeviceCode' &&
    hasNonEmptyStrings(value, ['userCode']) &&
    isSafeLoginUrl(value.verificationUrl)
  ) return value as unknown as CodexLoginStartResponse;
  return null;
}

export function parseLoginCompletedNotification(
  value: unknown,
): CodexLoginCompletedNotification | null {
  if (!isRecord(value) || !hasNonEmptyStrings(value, ['loginId']) ||
    typeof value.success !== 'boolean') return null;
  return { loginId: value.loginId as string, success: value.success };
}

export function parseModelListResponse(value: unknown): CodexModelListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  if (value.nextCursor !== undefined && value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' || value.nextCursor.trim().length === 0)) return null;
  for (const model of value.data) {
    if (!isRecord(model) || !hasStrings(model, ['description']) || !hasNonEmptyStrings(model, [
      'id',
      'model',
      'displayName',
      'defaultReasoningEffort',
    ]) || typeof model.hidden !== 'boolean' || typeof model.isDefault !== 'boolean' ||
      !Array.isArray(model.supportedReasoningEfforts)) return null;
    for (const effort of model.supportedReasoningEfforts) {
      if (!isRecord(effort) || !hasStrings(effort, ['description']) ||
        !hasNonEmptyStrings(effort, ['reasoningEffort'])) {
        return null;
      }
    }
  }
  return value as unknown as CodexModelListResponse;
}

function parseThreadResponse(value: unknown): CodexThreadResponse | null {
  if (!isRecord(value) || !isRecord(value.thread) ||
    !hasNonEmptyStrings(value.thread, ['id'])) return null;
  return { thread: { id: value.thread.id as string } };
}

export const parseThreadStartResponse = parseThreadResponse;
export const parseThreadResumeResponse = parseThreadResponse;

export function parseTurnStartResponse(value: unknown): CodexTurnStartResponse | null {
  if (!isRecord(value) || !isRecord(value.turn) ||
    !hasNonEmptyStrings(value.turn, ['id', 'status']) ||
    !['completed', 'interrupted', 'failed', 'inProgress'].includes(value.turn.status as string)) {
    return null;
  }
  return {
    turn: {
      id: value.turn.id as string,
      status: value.turn.status as CodexTurnStatus,
    },
  };
}

export function parseCommandExecResponse(value: unknown): CodexCommandExecResponse | null {
  if (!isRecord(value) || !Number.isInteger(value.exitCode) ||
    typeof value.stdout !== 'string' || typeof value.stderr !== 'string') return null;
  return {
    exitCode: value.exitCode as number,
    stdout: value.stdout,
    stderr: value.stderr,
  };
}
