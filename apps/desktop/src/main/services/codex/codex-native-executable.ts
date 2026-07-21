import { constants as fsConstants, promises as fsPromises } from 'fs';
import { createRequire } from 'module';
import path from 'path';

export interface CodexNativeExecutableDependencies {
  platform: NodeJS.Platform;
  arch: string;
  canonicalize: (value: string) => Promise<string>;
  resolvePackageJson: (packageName: string, launcher: string) => string;
  assertExecutable: (value: string) => Promise<void>;
}

const CODEX_NATIVE_TARGETS: Partial<Record<
  NodeJS.Platform,
  Partial<Record<string, { packageName: string; triple: string }>>
>> = {
  darwin: {
    arm64: { packageName: '@openai/codex-darwin-arm64', triple: 'aarch64-apple-darwin' },
    x64: { packageName: '@openai/codex-darwin-x64', triple: 'x86_64-apple-darwin' },
  },
  linux: {
    arm64: { packageName: '@openai/codex-linux-arm64', triple: 'aarch64-unknown-linux-musl' },
    x64: { packageName: '@openai/codex-linux-x64', triple: 'x86_64-unknown-linux-musl' },
  },
};

function pathIsContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

export async function resolveCodexNativeExecutable(
  launcher: string,
  dependencies: CodexNativeExecutableDependencies = {
    platform: process.platform,
    arch: process.arch,
    canonicalize: fsPromises.realpath,
    resolvePackageJson: (packageName, canonicalLauncher) => (
      createRequire(canonicalLauncher).resolve(packageName)
    ),
    assertExecutable: (value) => fsPromises.access(value, fsConstants.X_OK),
  },
): Promise<string> {
  const target = CODEX_NATIVE_TARGETS[dependencies.platform]?.[dependencies.arch];
  if (!target) throw new Error('Codex app-server is unsupported on this platform');
  const canonicalLauncher = await dependencies.canonicalize(launcher);
  const packageJson = await dependencies.canonicalize(dependencies.resolvePackageJson(
    `${target.packageName}/package.json`,
    canonicalLauncher,
  ));
  const packageRoot = path.dirname(packageJson);
  const candidate = await dependencies.canonicalize(path.join(
    packageRoot,
    'vendor',
    target.triple,
    'bin',
    'codex',
  ));
  if (!pathIsContained(packageRoot, candidate)) {
    throw new Error('Codex native executable escaped its platform package');
  }
  await dependencies.assertExecutable(candidate);
  return candidate;
}
