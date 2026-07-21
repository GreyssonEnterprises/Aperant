import { describe, expect, it } from 'vitest';
import {
  parseThreadResumeResponse,
  parseThreadStartResponse,
  parseTurnStartResponse,
  parseAccountReadResponse,
  parseInitializeResponse,
  parseLoginStartResponse,
  parseModelListResponse,
} from './codex-app-server-protocol';

describe('Codex app-server protocol validation', () => {
  it('accepts the execution response subset and rejects missing identifiers', () => {
    expect(parseThreadStartResponse({ thread: { id: 'thread-1' } })).toEqual({
      thread: { id: 'thread-1' },
    });
    expect(parseThreadResumeResponse({ thread: { id: 'thread-1' } })).toEqual({
      thread: { id: 'thread-1' },
    });
    expect(parseTurnStartResponse({ turn: { id: 'turn-1', status: 'inProgress' } })).toEqual({
      turn: { id: 'turn-1', status: 'inProgress' },
    });
    expect(parseThreadStartResponse({ thread: {} })).toBeNull();
    expect(parseThreadResumeResponse({})).toBeNull();
    expect(parseTurnStartResponse({ turn: { id: '', status: 'inProgress' } })).toBeNull();
    expect(parseTurnStartResponse({ turn: { id: 'turn-1', status: 'unknown' } })).toBeNull();
  });
  it('rejects empty required initialize, login, and model strings', () => {
    expect(parseInitializeResponse({
      codexHome: '',
      platformFamily: 'unix',
      platformOs: 'macos',
      userAgent: 'codex_cli_rs/0.144.6',
    })).toBeNull();
    expect(parseLoginStartResponse({
      type: 'chatgpt',
      loginId: '',
      authUrl: 'https://auth.openai.com/example',
    })).toBeNull();
    expect(parseLoginStartResponse({
      type: 'chatgpt',
      loginId: 'login-1',
      authUrl: '',
    })).toBeNull();
    expect(parseModelListResponse({
      data: [{
        id: 'model-id',
        model: '',
        displayName: 'Model',
        description: 'Description',
        hidden: false,
        isDefault: true,
        defaultReasoningEffort: 'medium',
        supportedReasoningEfforts: [],
      }],
    })).toBeNull();
  });

  it('type-checks optional Bedrock credentialSource', () => {
    expect(parseAccountReadResponse({
      account: { type: 'amazonBedrock', credentialSource: 42 },
      requiresOpenaiAuth: false,
    })).toBeNull();
    expect(parseAccountReadResponse({
      account: { type: 'amazonBedrock', credentialSource: 'environment' },
      requiresOpenaiAuth: false,
    })).toMatchObject({ account: { credentialSource: 'environment' } });
  });

  it('accepts safe login URLs and rejects unsafe protocols or remote HTTP', () => {
    expect(parseLoginStartResponse({
      type: 'chatgpt',
      loginId: 'login-1',
      authUrl: 'javascript:alert(1)',
    })).toBeNull();
    expect(parseLoginStartResponse({
      type: 'chatgpt',
      loginId: 'login-1',
      authUrl: 'http://auth.openai.com/example',
    })).toBeNull();
    expect(parseLoginStartResponse({
      type: 'chatgptDeviceCode',
      loginId: 'login-1',
      userCode: 'ABCD-EFGH',
      verificationUrl: 'http://localhost:1455/callback',
    })).not.toBeNull();
    expect(parseLoginStartResponse({
      type: 'chatgpt',
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/example',
    })).not.toBeNull();
  });
});
