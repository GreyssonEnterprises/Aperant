/**
 * Framework Detector Tests
 *
 * Tests for framework detection from package dependencies.
 * Covers Node.js, Python, Ruby, PHP, and Dart framework detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameworkDetector } from '../framework-detector';

// Mock all dependencies
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
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

describe('FrameworkDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fs mocks to default return values
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    // Mock path.join to return simple joined paths
    vi.mocked(path.join).mockImplementation((...parts: string[]) => parts.join('/'));
    // Mock path.resolve to return resolved path
    vi.mocked(path.resolve).mockImplementation((p: string) => `/resolved/${p}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // Constructor
  // ============================================

  describe('constructor', () => {
    it('should initialize with empty frameworks array', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');

      expect(detector.frameworks).toEqual([]);
    });

    it('should resolve project directory path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.resolve).mockImplementation((p: string) => `/resolved/${p}`);

      const detector = new FrameworkDetector('/test/project');

      // Path is resolved in constructor
      expect(detector).toBeDefined();
    });
  });

  // ============================================
  // detectAll
  // ============================================

  describe('detectAll', () => {
    it('should detect all framework types', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { react: '18.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      const frameworks = detector.detectAll();

      expect(frameworks).toContain('react');
    });

    it('should return empty array when no frameworks detected', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');
      const frameworks = detector.detectAll();

      expect(frameworks).toEqual([]);
    });
  });

  // ============================================
  // Node.js Framework Detection
  // ============================================

  describe('detectNodejsFrameworks', () => {
    it('should detect React from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { react: '18.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('react');
    });

    it('should detect Vue from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { vue: '3.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('vue');
    });

    it('should detect Next.js from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { next: '14.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('nextjs');
    });

    it('should detect Angular from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { '@angular/core': '17.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('angular');
    });

    it('should detect Express from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { express: '4.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('express');
    });

    it('should detect NestJS from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { '@nestjs/core': '10.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('nestjs');
    });

    it('should detect multiple frameworks from dependencies', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({
            dependencies: { react: '18.0.0', express: '4.0.0' },
            devDependencies: { vitest: '1.0.0' },
          });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('react');
      expect(detector.frameworks).toContain('express');
      expect(detector.frameworks).toContain('vitest');
    });

    it('should detect build tools like Vite', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ devDependencies: { vite: '5.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('vite');
    });

    it('should detect testing frameworks like Jest', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '29.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('jest');
    });

    it('should detect Prisma ORM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('package.json')) {
          return JSON.stringify({ dependencies: { prisma: '5.0.0' } });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toContain('prisma');
    });

    it('should skip detection when package.json does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toEqual([]);
    });

    it('should handle invalid package.json gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const detector = new FrameworkDetector('/test/project');
      detector.detectNodejsFrameworks();

      expect(detector.frameworks).toEqual([]);
    });
  });

  // ============================================
  // Python Framework Detection
  // ============================================

  describe('detectPythonFrameworks', () => {
    it('should detect Django from requirements.txt', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('requirements.txt')) {
          return 'django==4.0.0\nflask==2.0.0';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('django');
      expect(detector.frameworks).toContain('flask');
    });

    it('should detect FastAPI from requirements.txt', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('requirements.txt')) {
          return 'fastapi==0.100.0';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('fastapi');
    });

    it('should detect frameworks from pyproject.toml', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('pyproject.toml')) {
          return `
[tool.poetry.dependencies]
django = "^4.0.0"
pytest = "^7.0.0"
`;
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('django');
      expect(detector.frameworks).toContain('pytest');
    });

    it('should detect frameworks from modern pyproject.toml', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('pyproject.toml')) {
          return `
dependencies = ["flask", "celery"]
`;
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('flask');
      expect(detector.frameworks).toContain('celery');
    });

    it('should detect SQLAlchemy ORM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('requirements.txt')) {
          return 'sqlalchemy==2.0.0';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('sqlalchemy');
    });

    it('should skip detection when no Python files exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toEqual([]);
    });

    it('should ignore comments in requirements.txt', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('requirements.txt')) {
          return '# This is a comment\ndjango==4.0.0\n# Another comment\n-r requirements-dev.txt';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPythonFrameworks();

      expect(detector.frameworks).toContain('django');
    });
  });

  // ============================================
  // Ruby Framework Detection
  // ============================================

  describe('detectRubyFrameworks', () => {
    it('should detect Rails from Gemfile', () => {
      vi.mocked(fs.existsSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        return p.includes('Gemfile');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('Gemfile')) {
          return "gem 'rails'\ngem 'rspec-rails'";
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectRubyFrameworks();

      expect(detector.frameworks).toContain('rails');
      expect(detector.frameworks).toContain('rspec');
    });

    it('should detect Sinatra from Gemfile', () => {
      vi.mocked(fs.existsSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        return p.includes('Gemfile');
      }) as any);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('Gemfile')) {
          return "gem 'sinatra'\ngem 'rubocop'";
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectRubyFrameworks();

      expect(detector.frameworks).toContain('sinatra');
      expect(detector.frameworks).toContain('rubocop');
    });

    it('should skip detection when Gemfile does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');
      detector.detectRubyFrameworks();

      expect(detector.frameworks).toEqual([]);
    });
  });

  // ============================================
  // PHP Framework Detection
  // ============================================

  describe('detectPhpFrameworks', () => {
    it('should detect Laravel from composer.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('composer.json')) {
          return JSON.stringify({
            require: { 'laravel/framework': '^10.0.0' },
          });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toContain('laravel');
    });

    it('should detect Symfony from composer.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('composer.json')) {
          return JSON.stringify({
            require: { 'symfony/framework-bundle': '^6.0.0' },
          });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toContain('symfony');
    });

    it('should detect PHPUnit from composer.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('composer.json')) {
          return JSON.stringify({
            'require-dev': { 'phpunit/phpunit': '^9.0.0' },
          });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toContain('phpunit');
    });

    it('should detect frameworks from require-dev section', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('composer.json')) {
          return JSON.stringify({
            require: {},
            'require-dev': { 'phpunit/phpunit': '^9.0.0' },
          });
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toContain('phpunit');
    });

    it('should skip detection when composer.json does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toEqual([]);
    });

    it('should handle invalid composer.json gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const detector = new FrameworkDetector('/test/project');
      detector.detectPhpFrameworks();

      expect(detector.frameworks).toEqual([]);
    });
  });

  // ============================================
  // Dart Framework Detection
  // ============================================

  describe('detectDartFrameworks', () => {
    it('should detect Flutter from pubspec.yaml', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('pubspec.yaml')) {
          return `
dependencies:
  flutter:
    sdk: flutter
`;
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectDartFrameworks();

      expect(detector.frameworks).toContain('flutter');
    });

    it('should detect dart_frog from pubspec.yaml', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('pubspec.yaml')) {
          return 'dependencies:\n  dart_frog: ^1.0.0';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectDartFrameworks();

      expect(detector.frameworks).toContain('dart_frog');
    });

    it('should detect serverpod from pubspec.yaml', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(((filePath: any) => {
        const p = String(filePath);
        if (p.includes('pubspec.yaml')) {
          return 'dependencies:\n  serverpod: ^1.0.0';
        }
        return '';
      }) as any);

      const detector = new FrameworkDetector('/test/project');
      detector.detectDartFrameworks();

      expect(detector.frameworks).toContain('serverpod');
    });

    it('should skip detection when pubspec.yaml does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      // Clear any previous readFileSync mock to avoid carrying state
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const detector = new FrameworkDetector('/test/project');
      detector.detectDartFrameworks();

      expect(detector.frameworks).toEqual([]);
    });

    it('should handle invalid pubspec.yaml gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const detector = new FrameworkDetector('/test/project');
      detector.detectDartFrameworks();

      expect(detector.frameworks).toEqual([]);
    });
  });
});
