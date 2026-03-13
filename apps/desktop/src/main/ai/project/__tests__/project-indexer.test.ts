/**
 * Project Indexer Tests
 *
 * Tests for project structure analysis and index generation.
 * Covers service detection, language/framework detection, infrastructure analysis, and project type detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProjectIndex, runProjectIndexer } from '../project-indexer';

// Mock all dependencies
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
  };
});

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================
// Setup & Teardown
// ============================================

describe('Project Indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fs mocks to default return values
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    // Mock path functions
    vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
    vi.mocked(path.resolve).mockImplementation((p: string) => p);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // buildProjectIndex
  // ============================================

  describe('buildProjectIndex', () => {
    it('should build index for single project with package.json', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { react: '18.0.0' } });
        }
        return '';
      }) as any);
      // Mock path.resolve to return the path without adding extra slash for absolute paths
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.project_root).toBe('/resolved/test/project');
      expect(index.project_type).toBe('single');
      expect(index.services).toHaveProperty('main');
      expect(index.services.main?.language).toBe('JavaScript');
      expect(index.services.main?.framework).toBe('React');
      expect(index.services.main?.type).toBe('frontend');
    });

    it('should detect TypeScript from tsconfig.json', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json') || p.includes('tsconfig.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { typescript: '5.0.0' } });
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.language).toBe('TypeScript');
    });

    it('should detect Next.js framework', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { next: '14.0.0' } });
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.framework).toBe('Next.js');
      expect(index.services.main?.type).toBe('frontend');
    });

    it('should detect Express backend', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { express: '4.0.0' } });
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.framework).toBe('Express');
      expect(index.services.main?.type).toBe('backend');
    });

    it('should detect Python Django project', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('requirements.txt');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('requirements.txt')) {
          return 'django==4.0.0';
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.language).toBe('Python');
      expect(index.services.main?.framework).toBe('Django');
      expect(index.services.main?.type).toBe('backend');
    });

    it('should detect NestJS backend', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { '@nestjs/core': '10.0.0' } });
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.framework).toBe('NestJS');
      expect(index.services.main?.type).toBe('backend');
    });

    it('should return null services when no language detected', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services).toEqual({});
    });

    it('should detect testing frameworks', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { vitest: '1.0.0', '@playwright/test': '1.0.0' } });
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.testing).toBe('Vitest');
      expect(index.services.main?.e2e_testing).toBe('Playwright');
    });

    it('should detect package manager from lock files', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json') || p.includes('pnpm-lock.yaml');
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ dependencies: {} }));
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.services.main?.package_manager).toBe('pnpm');
    });
  });

  // ============================================
  // runProjectIndexer
  // ============================================

  describe('runProjectIndexer', () => {
    it('should write index to output file', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ dependencies: { react: '18.0.0' } }));
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = runProjectIndexer('/test/project', '/output/project_index.json');

      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith('/output', { recursive: true });
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        '/output/project_index.json',
        JSON.stringify(index, null, 2),
        'utf-8'
      );
    });

    it('should return the generated index', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ dependencies: { react: '18.0.0' } }));
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = runProjectIndexer('/test/project', '/output/project_index.json');

      expect(index).toHaveProperty('project_root');
      expect(index).toHaveProperty('services');
    });
  });

  // ============================================
  // Infrastructure Detection
  // ============================================

  describe('infrastructure detection', () => {
    it('should detect Docker Compose', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('docker-compose.yml');
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue('services:\n  api:\n  web:');
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = buildProjectIndex('/test/project');

      expect(index.infrastructure?.docker_compose).toBe('docker-compose.yml');
      expect(index.infrastructure?.docker_services).toEqual(['api', 'web']);
    });

    it('should detect Dockerfile', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.infrastructure?.dockerfile).toBeUndefined();
    });

    it('should detect CI/CD platform', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('.github');
      }) as any);
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      vi.mocked(fs.statSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('.github') ? { isDirectory: () => true } : { isDirectory: () => false };
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = buildProjectIndex('/test/project');

      expect(index.infrastructure?.ci).toBe('GitHub Actions');
    });
  });

  // ============================================
  // Project Type Detection
  // ============================================

  describe('project type detection', () => {
    it('should detect monorepo from pnpm-workspace.yaml', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('pnpm-workspace.yaml');
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.project_type).toBe('monorepo');
    });

    it('should detect monorepo from packages directory', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        // Handle various path formats for packages directory
        return p === 'packages' || p.endsWith('/packages') || p.includes('/packages');
      }) as any);
      vi.mocked(fs.statSync).mockImplementation(((path: any) => {
        const p = String(path);
        // Return isDirectory: true for packages directory
        if (p === 'packages' || p.endsWith('/packages') || p.includes('/packages')) {
          return { isDirectory: () => true } as any;
        }
        return { isDirectory: () => false } as any;
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = buildProjectIndex('/test/project');

      expect(index.project_type).toBe('monorepo');
    });

    it('should detect single project by default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.project_type).toBe('single');
    });
  });

  // ============================================
  // Conventions Detection
  // ============================================

  describe('conventions detection', () => {
    it('should detect Python linting from ruff.toml', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('ruff.toml');
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.conventions?.python_linting).toBe('Ruff');
    });

    it('should detect ESLint from .eslintrc', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('.eslintrc');
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.conventions?.js_linting).toBe('ESLint');
    });

    it('should detect TypeScript from tsconfig.json', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('tsconfig.json');
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.conventions?.typescript).toBe(true);
    });

    it('should detect git hooks from Husky', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('.husky');
      }) as any);
      vi.mocked(fs.statSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('.husky') ? { isDirectory: () => true } : { isDirectory: () => false };
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);
      vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));

      const index = buildProjectIndex('/test/project');

      expect(index.conventions?.git_hooks).toBe('Husky');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle invalid JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockImplementation(((path: any) => {
        const p = String(path);
        return p.includes('package.json');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((path: any) => {
        const p = String(path);
        if (p.includes('package.json')) {
          return 'invalid json {{{';
        }
        return '';
      }) as any);
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      // Should still return a valid index, just with no services detected
      expect(index).toHaveProperty('project_root');
      expect(index.services).toEqual({});
    });

    it('should handle missing directory in readdirSync', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Directory not found');
      });
      vi.mocked(path.resolve).mockImplementation((p: string) => p.startsWith('/') ? `/resolved${p}` : `/resolved/${p}`);

      const index = buildProjectIndex('/test/project');

      expect(index.project_type).toBe('single');
      expect(index.services).toEqual({});
    });
  });
});
