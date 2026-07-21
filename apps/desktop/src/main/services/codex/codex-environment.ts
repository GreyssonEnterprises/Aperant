import path from 'node:path';

const ALLOWED_ENVIRONMENT_KEYS = new Set([
  'APPDATA',
  'DISPLAY',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOCALAPPDATA',
  'LOGNAME',
  'OS',
  'PATH',
  'PATHEXT',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'SHELL',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'TZ',
  'USER',
  'WAYLAND_DISPLAY',
  'WINDIR',
  'XDG_RUNTIME_DIR',
]);

export function createCodexEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  codexHome: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && ALLOWED_ENVIRONMENT_KEYS.has(key.toUpperCase())) {
      environment[key] = value;
    }
  }
  environment.CODEX_HOME = codexHome;
  if (platform === 'win32') {
    environment.ComSpec = trustedWindowsCommandProcessor(baseEnv);
  }
  return environment;
}

export function trustedWindowsCommandProcessor(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuredRoot = environment.SystemRoot ?? environment.SYSTEMROOT;
  const systemRoot = configuredRoot && path.win32.isAbsolute(configuredRoot) &&
      path.win32.basename(configuredRoot).toLowerCase() === 'windows' &&
      !/[%!^&|<>"\r\n]/.test(configuredRoot)
    ? path.win32.normalize(configuredRoot)
    : 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', 'cmd.exe');
}
