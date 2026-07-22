import { describe, expect, it, vi } from 'vitest';
import * as cliTools from '../../cli-tool-manager';
import {
  detectCodexCli,
  detectCodexCliAsync,
  evaluateCodexCliVersion,
  parseCodexCliVersion,
  readCodexCliVersion,
  readCodexCliVersionAsync,
} from '../../cli-tool-manager';
import { trustedWindowsCommandProcessor } from './codex-environment';

describe('Codex CLI detection', () => {
  it('resolves the canonical packaged native binary instead of spawning the npm launcher', async () => {
    const resolveNative = (cliTools as unknown as {
      resolveCodexNativeExecutable: (
        launcher: string,
        dependencies: {
          platform: NodeJS.Platform;
          arch: string;
          canonicalize: (value: string) => Promise<string>;
          resolvePackageJson: (name: string, launcher: string) => string;
          assertExecutable: (value: string) => Promise<void>;
        },
      ) => Promise<string>;
    }).resolveCodexNativeExecutable;
    expect(resolveNative).toBeTypeOf('function');
    const assertExecutable = vi.fn(async () => undefined);

    await expect(resolveNative('/opt/homebrew/bin/codex', {
      platform: 'darwin',
      arch: 'arm64',
      canonicalize: async (value) => value === '/opt/homebrew/bin/codex'
        ? '/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js'
        : value,
      resolvePackageJson: (name, launcher) => {
        expect(name).toBe('@openai/codex-darwin-arm64/package.json');
        expect(launcher).toBe('/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js');
        return '/opt/homebrew/lib/node_modules/@openai/codex/node_modules/' +
          '@openai/codex-darwin-arm64/package.json';
      },
      assertExecutable,
    })).resolves.toBe(
      '/opt/homebrew/lib/node_modules/@openai/codex/node_modules/' +
      '@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
    );
    expect(assertExecutable).toHaveBeenCalledOnce();
  });

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
    const resolveNativeExecutableAsync = vi.fn(async () => '/opt/homebrew/lib/codex-native');

    await expect(detectCodexCliAsync({
      findExecutableAsync,
      readVersionAsync,
      resolveNativeExecutableAsync,
    })).resolves.toEqual({
      found: true,
      path: '/opt/homebrew/bin/codex',
      runtimePath: '/opt/homebrew/lib/codex-native',
      version: '0.144.6',
      runtimeValidationRequired: false,
    });
    expect(findExecutableAsync).toHaveBeenCalledWith('codex');
    expect(resolveNativeExecutableAsync).toHaveBeenCalledWith('/opt/homebrew/bin/codex');
  });

  it('versions Codex with a sanitized temporary home and removes it afterward', async () => {
    const execVersion = vi.fn(async () => ({ stdout: 'codex-cli 0.144.6\n' }));
    const removeTemporaryHome = vi.fn(async () => undefined);

    await expect(readCodexCliVersionAsync('/opt/homebrew/bin/codex', {
      baseEnv: async () => ({
        PATH: '/usr/bin',
        TEMP: '/tmp',
        HOME: '/Users/grimm',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\grimm',
        USERPROFILE: 'C:\\Users\\grimm',
        CODEX_HOME: '/Users/grimm/.codex',
        SENTRY_DSN: 'sentry-secret',
        OPENAI_API_KEY: 'provider-secret',
      }),
      createTemporaryHome: async () => '/tmp/aperant-codex-version-test',
      removeTemporaryHome,
      execFile: execVersion,
      isSecurePath: () => true,
      shouldUseShell: () => false,
      systemRoot: 'C:\\Windows',
    })).resolves.toBe('codex-cli 0.144.6\n');

    expect(execVersion).toHaveBeenCalledWith(
      '/opt/homebrew/bin/codex',
      ['--version'],
      expect.objectContaining({
        env: {
          CODEX_HOME: '/tmp/aperant-codex-version-test',
          PATH: '/usr/bin',
          TEMP: '/tmp',
        },
      }),
    );
    expect(removeTemporaryHome).toHaveBeenCalledWith('/tmp/aperant-codex-version-test');
  });

  it('ignores a hostile ComSpec and pins cmd.exe under System32', () => {
    expect(trustedWindowsCommandProcessor({
      ComSpec: 'C:\\Temp\\hostile.cmd',
      SystemRoot: 'C:\\Windows',
    })).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(trustedWindowsCommandProcessor({
      SystemRoot: 'D:\\attacker\\Windows',
    })).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(trustedWindowsCommandProcessor({
      SystemRoot: '\\\\server\\Windows',
    })).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(trustedWindowsCommandProcessor({
      windir: 'D:\\Windows',
    })).toBe('D:\\Windows\\System32\\cmd.exe');
  });

  it('rejects a hostile command processor passed to synchronous versioning', () => {
    const execFile = vi.fn();

    expect(() => readCodexCliVersion('C:\\Tools\\codex.cmd', {
      comSpec: 'C:\\Temp\\hostile.cmd',
      env: {},
      execFile,
      isSecurePath: () => true,
      shouldUseShell: () => true,
    })).toThrow('command processor');
    expect(execFile).not.toHaveBeenCalled();
  });
});
