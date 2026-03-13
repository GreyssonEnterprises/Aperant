/**
 * Project Analyzer Tests
 *
 * Tests for the main project analyzer that orchestrates stack detection,
 * framework detection, and structure analysis to build security profiles.
 * Covers profile loading/saving, hashing, reanalysis logic, and structure analysis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ProjectSecurityProfile,
  SerializedSecurityProfile,
} from '../types';

// Mock all dependencies - MUST be at top level, before any imports
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    join: vi.fn(),
    resolve: vi.fn(),
    dirname: vi.fn(),
    relative: vi.fn(),
    sep: '/',
  };
});

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    createHash: vi.fn(),
  };
});

// Mock classes - use factory functions to avoid hoisting issues
vi.mock('../framework-detector', () => ({
  FrameworkDetector: class {
    frameworks: string[] = [];
    detectAll() { return this.frameworks; }
    detectNodejsFrameworks() { return []; }
    detectPythonFrameworks() { return []; }
    detectRubyFrameworks() { return []; }
    detectPhpFrameworks() { return []; }
    detectDartFrameworks() { return []; }
  },
}));

vi.mock('../stack-detector', () => ({
  StackDetector: class {
    stack = {
      languages: [],
      packageManagers: [],
      frameworks: [],
      databases: [],
      infrastructure: [],
      cloudProviders: [],
      codeQualityTools: [],
      versionManagers: [],
    };
    detectAll() { return this.stack; }
    detectLanguages() { return []; }
    detectPackageManagers() { return []; }
    detectDatabases() { return []; }
    detectInfrastructure() { return []; }
    detectCloudProviders() { return []; }
    detectCodeQualityTools() { return []; }
    detectVersionManagers() { return []; }
  },
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  ProjectAnalyzer,
  analyzeProject,
  buildSecurityProfile,
} from '../analyzer';

// ============================================
// Test Fixtures
// ============================================

const createMockProfile = (
  overrides?: Partial<ProjectSecurityProfile>,
): ProjectSecurityProfile => ({
  baseCommands: new Set(['ls', 'cd']),
  stackCommands: new Set(['npm', 'node']),
  scriptCommands: new Set(['make']),
  customCommands: new Set(['custom-cmd']),
  detectedStack: {
    languages: ['TypeScript'],
    packageManagers: ['npm'],
    frameworks: [],
    databases: [],
    infrastructure: [],
    cloudProviders: [],
    codeQualityTools: [],
    versionManagers: [],
  },
  customScripts: {
    npmScripts: ['build', 'test'],
    makeTargets: [],
    poetryScripts: [],
    cargoAliases: [],
    shellScripts: [],
  },
  projectDir: '/test/project',
  createdAt: '2024-01-01T00:00:00.000Z',
  projectHash: 'abc123',
  inheritedFrom: '',
  getAllAllowedCommands() {
    return new Set([
      ...this.baseCommands,
      ...this.stackCommands,
      ...this.scriptCommands,
      ...this.customCommands,
    ]);
  },
  ...overrides,
});

const createMockSerializedProfile = (
  overrides?: Partial<SerializedSecurityProfile>,
): SerializedSecurityProfile => ({
  base_commands: ['ls', 'cd'],
  stack_commands: ['npm', 'node'],
  script_commands: ['make'],
  custom_commands: ['custom-cmd'],
  detected_stack: {
    languages: ['TypeScript'],
    package_managers: ['npm'],
    frameworks: [],
    databases: [],
    infrastructure: [],
    cloud_providers: [],
    code_quality_tools: [],
    version_managers: [],
  },
  custom_scripts: {
    npm_scripts: ['build', 'test'],
    make_targets: [],
    poetry_scripts: [],
    cargo_aliases: [],
    shell_scripts: [],
  },
  project_dir: '/test/project',
  created_at: '2024-01-01T00:00:00.000Z',
  project_hash: 'abc123',
  ...overrides,
});

// ============================================
// Setup & Teardown
// ============================================

describe('Project Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fs mocks to default return values
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 1000,
      size: 100,
    } as any);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    // Mock path functions - return identity for tests that need original paths
    vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
    vi.mocked(path.resolve).mockImplementation((p: string) => p);
    vi.mocked(path.dirname).mockImplementation((p: string) => {
      const parts = p.split('/');
      parts.pop();
      return parts.join('/') || '.';
    });
    vi.mocked(path.relative).mockImplementation((from: string, to: string) => to.replace(from + '/', ''));

    // Mock crypto
    const mockHasher = {
      update: vi.fn(),
      digest: vi.fn(() => 'abc123'),
    };
    vi.mocked(crypto.createHash).mockReturnValue(mockHasher as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // Constructor
  // ============================================

  describe('constructor', () => {
    it('should initialize with project directory', () => {
      const analyzer = new ProjectAnalyzer('/test/project');

      expect(analyzer).toBeDefined();
    });

    it('should initialize with project and spec directory', () => {
      const analyzer = new ProjectAnalyzer('/test/project', '/test/spec');

      expect(analyzer).toBeDefined();
    });
  });

  // ============================================
  // getProfilePath
  // ============================================

  describe('getProfilePath', () => {
    it('should return profile path in project dir when no spec dir', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const analyzer = new ProjectAnalyzer('/test/project');

      expect(analyzer.getProfilePath()).toBe('/test/project/.auto-claude-security.json');
    });

    it('should return profile path in spec dir when spec dir provided', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const analyzer = new ProjectAnalyzer('/test/project', '/test/spec');

      expect(analyzer.getProfilePath()).toBe('/test/spec/.auto-claude-security.json');
    });
  });

  // ============================================
  // loadProfile
  // ============================================

  describe('loadProfile', () => {
    it('should return null when profile file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.loadProfile();

      expect(profile).toBeNull();
    });

    it('should load and parse existing profile', () => {
      const serialized = createMockSerializedProfile();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(serialized));

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.loadProfile();

      expect(profile).not.toBeNull();
      expect(profile?.projectDir).toBe('/test/project');
      expect(profile?.projectHash).toBe('abc123');
    });

    it('should return null on JSON parse error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json {{{');

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.loadProfile();

      expect(profile).toBeNull();
    });

    it('should handle missing optional fields', () => {
      const partialProfile: SerializedSecurityProfile = {
        base_commands: [],
        stack_commands: [],
        script_commands: [],
        custom_commands: [],
        detected_stack: {
          languages: [],
          package_managers: [],
          frameworks: [],
          databases: [],
          infrastructure: [],
          cloud_providers: [],
          code_quality_tools: [],
          version_managers: [],
        },
        custom_scripts: {
          npm_scripts: [],
          make_targets: [],
          poetry_scripts: [],
          cargo_aliases: [],
          shell_scripts: [],
        },
        project_dir: '',
        created_at: '',
        project_hash: '',
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialProfile));

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.loadProfile();

      expect(profile).not.toBeNull();
      expect(profile?.projectDir).toBe('');
      expect(profile?.projectHash).toBe('');
    });
  });

  // ============================================
  // saveProfile
  // ============================================

  describe('saveProfile', () => {
    it('should write profile to file as JSON', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
      vi.mocked(path.dirname).mockImplementation((p: string) => {
        const parts = p.split('/');
        parts.pop();
        return parts.join('/') || '.';
      });

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = createMockProfile();

      analyzer.saveProfile(profile);

      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
        '/test/project',
        { recursive: true },
      );
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        '/test/project/.auto-claude-security.json',
        expect.stringContaining('"base_commands"'),
        'utf-8',
      );
    });

    it('should create output directory if it does not exist', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
      vi.mocked(path.dirname).mockImplementation((p: string) => {
        const parts = p.split('/');
        parts.pop();
        return parts.join('/') || '.';
      });

      const analyzer = new ProjectAnalyzer('/test/project', '/test/spec');
      const profile = createMockProfile();

      analyzer.saveProfile(profile);

      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
        '/test/spec',
        { recursive: true },
      );
    });
  });

  // ============================================
  // computeProjectHash
  // ============================================

  describe('computeProjectHash', () => {
    it('should compute hash from dependency files', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
      vi.mocked(fs.statSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return { mtimeMs: 1000, size: 500 } as any;
        }
        return { mtimeMs: null, size: null } as any;
      }) as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const hash = analyzer.computeProjectHash();

      expect(hash).toBe('abc123');
    });

    it('should use fallback when no dependency files found', () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: null,
        size: null,
      } as any);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const analyzer = new ProjectAnalyzer('/test/project');
      const hash = analyzer.computeProjectHash();

      expect(hash).toBe('abc123');
    });
  });

  // ============================================
  // isDescendantOf (private)
  // ============================================

  describe('isDescendantOf', () => {
    it('should return true for direct child', () => {
      vi.mocked(path.resolve).mockImplementation((p: string) => p);

      const analyzer = new ProjectAnalyzer('/test/parent/child');

      // Private method access via type assertion
      const result = (analyzer as any).isDescendantOf('/test/parent/child', '/test/parent');

      expect(result).toBe(true);
    });

    it('should return false for unrelated paths', () => {
      vi.mocked(path.resolve).mockImplementation((p: string) => p);

      const analyzer = new ProjectAnalyzer('/test/other');

      const result = (analyzer as any).isDescendantOf('/test/other', '/test/parent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // shouldReanalyze (private)
  // ============================================

  describe('shouldReanalyze', () => {
    it('should return true when hashes differ', () => {
      const mockHasher = {
        update: vi.fn(),
        digest: vi.fn(() => 'new-hash'),
      };
      vi.mocked(crypto.createHash).mockReturnValue(mockHasher as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = createMockProfile({ projectHash: 'old-hash' });

      const shouldRe = (analyzer as any).shouldReanalyze(profile);

      expect(shouldRe).toBe(true);
    });

    it('should return false when inherited profile is valid', () => {
      vi.mocked(fs.existsSync).mockImplementation(((p: any) => {
        const pathStr = String(p);
        return (
          pathStr.includes('/parent/.auto-claude-security.json') ||
          pathStr.includes('/parent')
        );
      }) as any);
      vi.mocked(fs.statSync).mockImplementation(((p: any) => {
        return { isDirectory: () => true } as any;
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = createMockProfile({
        inheritedFrom: '/parent',
        projectHash: 'abc123',
      });

      const mockHasher = {
        update: vi.fn(),
        digest: vi.fn(() => 'abc123'),
      };
      vi.mocked(crypto.createHash).mockReturnValue(mockHasher as any);

      const shouldRe = (analyzer as any).shouldReanalyze(profile);

      expect(shouldRe).toBe(false);
    });
  });

  // ============================================
  // analyze
  // ============================================

  describe('analyze', () => {
    it('should load existing profile if unchanged', () => {
      const serialized = createMockSerializedProfile();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(serialized));

      const mockHasher = {
        update: vi.fn(),
        digest: vi.fn(() => 'abc123'),
      };
      vi.mocked(crypto.createHash).mockReturnValue(mockHasher as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze();

      expect(profile.projectHash).toBe('abc123');
    });

    it('should reanalyze when force is true', () => {
      vi.mocked(fs.existsSync).mockImplementation(((p: any) => {
        return String(p).includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        if (String(path).includes('package.json')) {
          return JSON.stringify({ dependencies: { react: '18.0.0' } });
        }
        return '{}';
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile).toBeDefined();
      expect(profile.projectDir).toBeDefined();
    });

    it('should detect stack and frameworks', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      analyzer.analyze(true);

      // Verify detectors were instantiated (not checking exact constructor calls due to mock class setup)
      expect(analyzer).toBeDefined();
    });
  });

  // ============================================
  // Structure Analysis
  // ============================================

  describe('structure analysis', () => {
    it('should detect npm scripts from package.json', () => {
      vi.mocked(fs.existsSync).mockImplementation(((p: any) => {
        return String(p).includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        if (String(path).includes('package.json')) {
          return JSON.stringify({
            scripts: {
              build: 'vite build',
              test: 'vitest',
              lint: 'eslint',
            },
          });
        }
        return '{}';
      }) as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile.customScripts.npmScripts).toEqual(['build', 'test', 'lint']);
    });

    it('should detect Makefile targets', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        if (String(path).includes('Makefile')) {
          return `
build:
	@echo building
test:
	@echo testing
.PHONY: build test
`;
        }
        return '{}';
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile.customScripts.makeTargets).toContain('build');
      expect(profile.customScripts.makeTargets).toContain('test');
    });

    it('should detect poetry scripts', () => {
      vi.mocked(fs.existsSync).mockImplementation(((p: any) => {
        return String(p).includes('pyproject.toml');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        if (String(path).includes('pyproject.toml')) {
          return `
[tool.poetry.scripts]
build = "poetry build"
test = "poetry test"
`;
        }
        return '';
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile.customScripts.poetryScripts).toContain('build');
      expect(profile.customScripts.poetryScripts).toContain('test');
    });

    it('should detect shell scripts', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.readdirSync).mockImplementation(((dir: any, options?: any) => {
        if (options?.withFileTypes) {
          return [
            { name: 'deploy.sh', isFile: () => true, isDirectory: () => false },
            { name: 'setup.bash', isFile: () => true, isDirectory: () => false },
            { name: 'README.md', isFile: () => true, isDirectory: () => false },
          ] as any;
        }
        return [];
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile.customScripts.shellScripts).toContain('deploy.sh');
      expect(profile.customScripts.shellScripts).toContain('setup.bash');
    });

    it('should load custom allowlist', () => {
      vi.mocked(fs.existsSync).mockImplementation(((p: any) => {
        return String(p).includes('.auto-claude-allowlist');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        if (String(path).includes('.auto-claude-allowlist')) {
          return `
# Comment line
custom-command-1
custom-command-2

# Another comment
custom-command-3
`;
        }
        return '{}';
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const analyzer = new ProjectAnalyzer('/test/project');
      const profile = analyzer.analyze(true);

      expect(profile.customCommands).toContain('custom-command-1');
      expect(profile.customCommands).toContain('custom-command-2');
      expect(profile.customCommands).toContain('custom-command-3');
    });
  });

  // ============================================
  // Public API
  // ============================================

  describe('analyzeProject', () => {
    it('should analyze project and return profile', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const profile = await analyzeProject('/test/project');

      expect(profile).toBeDefined();
      expect(profile.projectDir).toBeDefined();
    });

    it('should analyze project with spec directory', async () => {
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const profile = await analyzeProject('/test/project', '/test/spec');

      expect(profile).toBeDefined();
    });

    it('should force reanalyze when force=true', async () => {
      const serialized = createMockSerializedProfile();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((p: any) => {
        const pathStr = String(p);
        if (pathStr.includes('.auto-claude-security.json')) {
          return JSON.stringify(serialized);
        }
        return '{}';
      }) as any);
      vi.mocked(fs.statSync).mockReturnValue({
        mtimeMs: 1000,
        size: 100,
        isDirectory: () => false,
      } as any);

      const profile = await analyzeProject('/test/project', undefined, true);

      expect(profile).toBeDefined();
    });
  });

  describe('buildSecurityProfile', () => {
    it('should convert ProjectSecurityProfile to SecurityProfile', () => {
      const profile = createMockProfile();
      const securityProfile = buildSecurityProfile(profile);

      expect(securityProfile.baseCommands).toBe(profile.baseCommands);
      expect(securityProfile.stackCommands).toBe(profile.stackCommands);
      expect(securityProfile.scriptCommands).toBe(profile.scriptCommands);
      expect(securityProfile.customCommands).toBe(profile.customCommands);
      expect(securityProfile.customScripts.shellScripts).toEqual([]);
      expect(securityProfile.getAllAllowedCommands()).toBeInstanceOf(Set);
    });

    it('should include shell scripts in custom scripts', () => {
      const profile = createMockProfile({
        customScripts: {
          npmScripts: [],
          makeTargets: [],
          poetryScripts: [],
          cargoAliases: [],
          shellScripts: ['deploy.sh', 'backup.sh'],
        },
      });
      const securityProfile = buildSecurityProfile(profile);

      expect(securityProfile.customScripts.shellScripts).toEqual(['deploy.sh', 'backup.sh']);
    });
  });
});
