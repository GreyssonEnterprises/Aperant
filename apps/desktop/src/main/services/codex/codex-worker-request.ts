import type { Phase } from '../../ai/config/types';

const PHASES = new Set<Phase>(['spec', 'planning', 'coding', 'qa']);
const REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const REQUEST_KEYS = new Set([
  'phase', 'reasoningEffort', 'systemPrompt', 'input', 'outputSchema',
]);
const FORBIDDEN_SCHEMA_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_PROMPT_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_SCHEMA_DEPTH = 12;
const MAX_SCHEMA_NODES = 512;

export interface ValidatedCodexWorkerRequest {
  phase: Phase;
  reasoningEffort?: string;
  systemPrompt: string;
  input: string;
  outputSchema?: unknown;
}

function invalid(): never {
  throw new Error('Invalid Codex worker request');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes;
}

function validateJsonSchema(value: unknown): unknown {
  if (!isRecord(value)) invalid();
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_SCHEMA_NODES || depth > MAX_SCHEMA_DEPTH) invalid();
    if (node === null || typeof node === 'string' || typeof node === 'boolean' ||
      typeof node === 'number' && Number.isFinite(node)) return;
    if (typeof node !== 'object') invalid();
    if (seen.has(node)) invalid();
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length > MAX_SCHEMA_NODES) invalid();
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!isRecord(node)) invalid();
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_SCHEMA_KEYS.has(key)) invalid();
      if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#'))) invalid();
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SCHEMA_BYTES) invalid();
  return JSON.parse(serialized) as unknown;
}

export function parseCodexWorkerRequest(value: unknown): ValidatedCodexWorkerRequest {
  if (!isRecord(value) || Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) invalid();
  if (typeof value.phase !== 'string' || !PHASES.has(value.phase as Phase)) invalid();
  if (!boundedString(value.systemPrompt, MAX_PROMPT_BYTES) ||
    !boundedString(value.input, MAX_INPUT_BYTES)) invalid();
  if (value.reasoningEffort !== undefined && (
    typeof value.reasoningEffort !== 'string' || !REASONING_EFFORTS.has(value.reasoningEffort)
  )) invalid();
  return {
    phase: value.phase as Phase,
    systemPrompt: value.systemPrompt,
    input: value.input,
    ...(value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}),
    ...(value.outputSchema !== undefined
      ? { outputSchema: validateJsonSchema(value.outputSchema) }
      : {}),
  };
}

export function isCodexRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}
