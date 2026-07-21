import { describe, expect, it, vi } from 'vitest';
import {
  detectCodexCli,
  detectCodexCliAsync,
  evaluateCodexCliVersion,
  parseCodexCliVersion,
  readCodexCliVersion,
} from '../../cli-tool-manager';

describe('Codex CLI detection', () => {
  it('finds the installed executable through the augmented PATH resolver', () => {
    const findExecutable = vi.fn(() => '/opt/homebrew/bin/codex');
    const readVersion = vi.fn(() => 'codex-cli 0.144.6\n');

    expect(detectCodexCli({ findExecutable, readVersion })).toEqual({
      found: true,
      path: '/opt/homebrew/bin/codex',
      version: '0.144.6',
      runtimeValidationRequired: false,
    });
    expect(findExecutable).toHaveBeenCalledWith('codex');
    expect(readVersion).toHaveBeenCalledWith('/opt/homebrew/bin/codex');
  });

  it('rejects missing and malformed installations instead of falling back to PATH', () => {
    expect(detectCodexCli({
      findExecutable: () => null,
      readVersion: vi.fn(),
    })).toMatchObject({
      found: false,
      message: expect.stringContaining('Install Codex CLI'),
    });

    expect(detectCodexCli({
      findExecutable: () => '/usr/local/bin/codex',
      readVersion: () => 'not-a-version',
    })).toMatchObject({
      found: false,
      message: expect.stringContaining('Unable to parse'),
    });
  });

  it('parses the supported output without accepting partial versions', () => {
    expect(parseCodexCliVersion('codex-cli 0.144.6')).toBe('0.144.6');
    expect(parseCodexCliVersion('codex 0.144')).toBeNull();
    expect(parseCodexCliVersion('release 0.144.6-beta')).toBeNull();
  });

  it('accepts 0.144.x as tested, rejects older versions, and gates newer versions', () => {
    expect(evaluateCodexCliVersion('0.144.0')).toEqual({
      supported: true,
      runtimeValidationRequired: false,
    });
    expect(evaluateCodexCliVersion('0.143.99')).toMatchObject({
      supported: false,
      message: expect.stringContaining('0.144.0 or newer'),
    });
    expect(evaluateCodexCliVersion('0.145.0')).toEqual({
      supported: true,
      runtimeValidationRequired: true,
    });
    expect(evaluateCodexCliVersion('1.0.0')).toEqual({
      supported: true,
      runtimeValidationRequired: true,
    });
  });

  it('validates npm-installed codex.cmd through a secure Windows command shell', () => {
    const execFile = vi.fn(() => 'codex-cli 0.144.6\n');

    expect(readCodexCliVersion('C:\\Users\\grimm\\AppData\\Roaming\\npm\\codex.cmd', {
      comSpec: 'C:\\Windows\\System32\\cmd.exe',
      env: { PATH: 'C:\\Windows\\System32' },
      execFile,
      isSecurePath: () => true,
      shouldUseShell: () => true,
    })).toBe('codex-cli 0.144.6\n');
    expect(execFile).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', '""C:\\Users\\grimm\\AppData\\Roaming\\npm\\codex.cmd" --version"'],
      expect.objectContaining({ windowsVerbatimArguments: true }),
    );
  });

  it('rejects an insecure codex.cmd path before executing it', () => {
    const execFile = vi.fn();
    expect(() => readCodexCliVersion('C:\\Temp\\codex.cmd', {
      comSpec: 'cmd.exe',
      env: {},
      execFile,
      isSecurePath: () => false,
      shouldUseShell: () => true,
    })).toThrow('security validation');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('discovers and versions Codex asynchronously for Electron main', async () => {
    const findExecutableAsync = vi.fn(async () => '/opt/homebrew/bin/codex');
    const readVersionAsync = vi.fn(async () => 'codex-cli 0.144.6\n');

    await expect(detectCodexCliAsync({ findExecutableAsync, readVersionAsync })).resolves.toEqual({
      found: true,
      path: '/opt/homebrew/bin/codex',
      version: '0.144.6',
      runtimeValidationRequired: false,
    });
    expect(findExecutableAsync).toHaveBeenCalledWith('codex');
  });
});
