import { describe, expect, it } from 'vitest';

import { parseCodexWorkerRequest } from './codex-worker-request';

describe('Codex worker request validation', () => {
  it('accepts only bounded phase execution inputs', () => {
    expect(parseCodexWorkerRequest({
      phase: 'coding',
      reasoningEffort: 'high',
      systemPrompt: 'Implement the approved subtask.',
      input: 'Run the coding phase.',
      outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
    })).toEqual({
      phase: 'coding',
      reasoningEffort: 'high',
      systemPrompt: 'Implement the approved subtask.',
      input: 'Run the coding phase.',
      outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
    });
  });

  it('accepts max reasoning effort', () => {
    expect(parseCodexWorkerRequest({
      phase: 'coding',
      reasoningEffort: 'max',
      systemPrompt: 'Implement the approved subtask.',
      input: 'Run the coding phase.',
    })).toMatchObject({ reasoningEffort: 'max' });
  });

  it.each([
    { phase: '../escape', systemPrompt: 'x', input: 'x' },
    { phase: 'coding', systemPrompt: 'x', input: 'x', accountId: 'other-account' },
    { phase: 'coding', systemPrompt: 'x', input: 'x', reasoningEffort: 'unbounded' },
    { phase: 'coding', systemPrompt: 'x'.repeat(300_000), input: 'x' },
  ])('rejects untrusted identity fields and unbounded values: %#', (value) => {
    expect(() => parseCodexWorkerRequest(value)).toThrow('Invalid Codex worker request');
  });

  it.each([
    { type: 'object', $ref: 'https://attacker.invalid/schema.json' },
    { type: 'object', properties: JSON.parse('{"__proto__":{"type":"string"}}') },
    { type: 'object', properties: { value: { constructor: { type: 'string' } } } },
    { type: 'object', properties: { value: { type: 'string' } }, padding: 'x'.repeat(70_000) },
  ])('rejects unsafe output schemas: %#', (outputSchema) => {
    expect(() => parseCodexWorkerRequest({
      phase: 'planning', systemPrompt: 'x', input: 'x', outputSchema,
    })).toThrow('Invalid Codex worker request');
  });
});
