/**
 * Command Registry Tests
 *
 * Tests for centralized command registry for dynamic security profiles.
 * Covers base commands, language commands, framework commands, and infrastructure commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BASE_COMMANDS,
  LANGUAGE_COMMANDS,
  PACKAGE_MANAGER_COMMANDS,
  FRAMEWORK_COMMANDS,
  DATABASE_COMMANDS,
  INFRASTRUCTURE_COMMANDS,
  CLOUD_COMMANDS,
  CODE_QUALITY_COMMANDS,
  VERSION_MANAGER_COMMANDS,
} from '../command-registry';

// ============================================
// Setup & Teardown
// ============================================

describe('Command Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // BASE_COMMANDS
  // ============================================

  describe('BASE_COMMANDS', () => {
    it('should be a Set', () => {
      expect(BASE_COMMANDS).toBeInstanceOf(Set);
    });

    it('should include core shell commands', () => {
      expect(BASE_COMMANDS.has('echo')).toBe(true);
      expect(BASE_COMMANDS.has('cat')).toBe(true);
      expect(BASE_COMMANDS.has('ls')).toBe(true);
      expect(BASE_COMMANDS.has('pwd')).toBe(true);
    });

    it('should include navigation commands', () => {
      expect(BASE_COMMANDS.has('cd')).toBe(true);
      expect(BASE_COMMANDS.has('pushd')).toBe(true);
      expect(BASE_COMMANDS.has('popd')).toBe(true);
    });

    it('should include file operations', () => {
      expect(BASE_COMMANDS.has('cp')).toBe(true);
      expect(BASE_COMMANDS.has('mv')).toBe(true);
      expect(BASE_COMMANDS.has('mkdir')).toBe(true);
      expect(BASE_COMMANDS.has('rm')).toBe(true);
      expect(BASE_COMMANDS.has('touch')).toBe(true);
    });

    it('should include text processing', () => {
      expect(BASE_COMMANDS.has('grep')).toBe(true);
      expect(BASE_COMMANDS.has('sed')).toBe(true);
      expect(BASE_COMMANDS.has('awk')).toBe(true);
      expect(BASE_COMMANDS.has('sort')).toBe(true);
      expect(BASE_COMMANDS.has('uniq')).toBe(true);
    });

    it('should include archive commands', () => {
      expect(BASE_COMMANDS.has('tar')).toBe(true);
      expect(BASE_COMMANDS.has('zip')).toBe(true);
      expect(BASE_COMMANDS.has('unzip')).toBe(true);
    });

    it('should include process commands', () => {
      expect(BASE_COMMANDS.has('ps')).toBe(true);
      expect(BASE_COMMANDS.has('kill')).toBe(true);
      expect(BASE_COMMANDS.has('pgrep')).toBe(true);
    });

    it('should include network commands', () => {
      expect(BASE_COMMANDS.has('curl')).toBe(true);
      expect(BASE_COMMANDS.has('wget')).toBe(true);
      expect(BASE_COMMANDS.has('ping')).toBe(true);
      expect(BASE_COMMANDS.has('host')).toBe(true);
      expect(BASE_COMMANDS.has('dig')).toBe(true);
      expect(BASE_COMMANDS.has('git')).toBe(true);
    });

    it('should include shell interpreters', () => {
      expect(BASE_COMMANDS.has('sh')).toBe(true);
      expect(BASE_COMMANDS.has('bash')).toBe(true);
      expect(BASE_COMMANDS.has('zsh')).toBe(true);
    });
  });

  // ============================================
  // LANGUAGE_COMMANDS
  // ============================================

  describe('LANGUAGE_COMMANDS', () => {
    it('should include Python commands', () => {
      expect(LANGUAGE_COMMANDS.python).toContain('python');
      expect(LANGUAGE_COMMANDS.python).toContain('python3');
      expect(LANGUAGE_COMMANDS.python).toContain('pip');
      expect(LANGUAGE_COMMANDS.python).toContain('pip3');
    });

    it('should include JavaScript/TypeScript commands', () => {
      expect(LANGUAGE_COMMANDS.javascript).toContain('node');
      expect(LANGUAGE_COMMANDS.javascript).toContain('npm');
      expect(LANGUAGE_COMMANDS.javascript).toContain('npx');
      expect(LANGUAGE_COMMANDS.typescript).toContain('tsc');
      expect(LANGUAGE_COMMANDS.typescript).toContain('ts-node');
    });

    it('should include Rust commands', () => {
      expect(LANGUAGE_COMMANDS.rust).toContain('cargo');
      expect(LANGUAGE_COMMANDS.rust).toContain('rustc');
      expect(LANGUAGE_COMMANDS.rust).toContain('rustup');
    });

    it('should include Go commands', () => {
      expect(LANGUAGE_COMMANDS.go).toContain('go');
      expect(LANGUAGE_COMMANDS.go).toContain('gofmt');
    });

    it('should include Java commands', () => {
      expect(LANGUAGE_COMMANDS.java).toContain('java');
      expect(LANGUAGE_COMMANDS.java).toContain('javac');
    });

    it('should include Ruby commands', () => {
      expect(LANGUAGE_COMMANDS.ruby).toContain('ruby');
      expect(LANGUAGE_COMMANDS.ruby).toContain('gem');
      expect(LANGUAGE_COMMANDS.ruby).toContain('irb');
    });

    it('should include PHP commands', () => {
      expect(LANGUAGE_COMMANDS.php).toContain('php');
      expect(LANGUAGE_COMMANDS.php).toContain('composer');
    });

    it('should include Dart commands', () => {
      expect(LANGUAGE_COMMANDS.dart).toContain('dart');
      expect(LANGUAGE_COMMANDS.dart).toContain('pub');
      expect(LANGUAGE_COMMANDS.dart).toContain('flutter');
    });
  });

  // ============================================
  // PACKAGE_MANAGER_COMMANDS
  // ============================================

  describe('PACKAGE_MANAGER_COMMANDS', () => {
    it('should include npm', () => {
      expect(PACKAGE_MANAGER_COMMANDS.npm).toContain('npm');
      expect(PACKAGE_MANAGER_COMMANDS.npm).toContain('npx');
    });

    it('should include Yarn', () => {
      expect(PACKAGE_MANAGER_COMMANDS.yarn).toContain('yarn');
    });

    it('should include pnpm', () => {
      expect(PACKAGE_MANAGER_COMMANDS.pnpm).toContain('pnpm');
    });

    it('should include Bun', () => {
      expect(PACKAGE_MANAGER_COMMANDS.bun).toContain('bun');
    });

    it('should include pip', () => {
      expect(PACKAGE_MANAGER_COMMANDS.pip).toContain('pip');
      expect(PACKAGE_MANAGER_COMMANDS.pip).toContain('pip3');
    });

    it('should include Poetry', () => {
      expect(PACKAGE_MANAGER_COMMANDS.poetry).toContain('poetry');
    });

    it('should include pipenv', () => {
      expect(PACKAGE_MANAGER_COMMANDS.pipenv).toContain('pipenv');
    });

    it('should include Cargo', () => {
      expect(PACKAGE_MANAGER_COMMANDS.cargo).toContain('cargo');
    });

    it('should include Composer', () => {
      expect(PACKAGE_MANAGER_COMMANDS.composer).toContain('composer');
    });

    it('should include Bundler', () => {
      expect(PACKAGE_MANAGER_COMMANDS.gem).toContain('bundle');
      expect(PACKAGE_MANAGER_COMMANDS.gem).toContain('bundler');
    });
  });

  // ============================================
  // FRAMEWORK_COMMANDS
  // ============================================

  describe('FRAMEWORK_COMMANDS', () => {
    it('should include React commands', () => {
      expect(FRAMEWORK_COMMANDS.react).toContain('react-scripts');
    });

    it('should include Vue commands', () => {
      expect(FRAMEWORK_COMMANDS.vue).toContain('vue-cli-service');
      expect(FRAMEWORK_COMMANDS.vue).toContain('vite');
    });

    it('should include Angular commands', () => {
      expect(FRAMEWORK_COMMANDS.angular).toContain('ng');
    });

    it('should include Next.js commands', () => {
      expect(FRAMEWORK_COMMANDS.nextjs).toContain('next');
    });

    it('should include Nuxt commands', () => {
      expect(FRAMEWORK_COMMANDS.nuxt).toContain('nuxt');
      expect(FRAMEWORK_COMMANDS.nuxt).toContain('nuxi');
    });

    it('should include Svelte commands', () => {
      expect(FRAMEWORK_COMMANDS.svelte).toContain('svelte-kit');
    });

    it('should include Express commands', () => {
      expect(FRAMEWORK_COMMANDS.express).toContain('express');
    });

    it('should include Django commands', () => {
      expect(FRAMEWORK_COMMANDS.django).toContain('django-admin');
      expect(FRAMEWORK_COMMANDS.django).toContain('gunicorn');
      expect(FRAMEWORK_COMMANDS.django).toContain('daphne');
    });

    it('should include Flask commands', () => {
      expect(FRAMEWORK_COMMANDS.flask).toContain('flask');
      expect(FRAMEWORK_COMMANDS.flask).toContain('gunicorn');
    });

    it('should include Rails commands', () => {
      expect(FRAMEWORK_COMMANDS.rails).toContain('rails');
      expect(FRAMEWORK_COMMANDS.rails).toContain('rake');
    });

    it('should include Laravel commands', () => {
      expect(FRAMEWORK_COMMANDS.laravel).toContain('artisan');
      expect(FRAMEWORK_COMMANDS.laravel).toContain('sail');
    });

    it('should include Electron commands', () => {
      expect(FRAMEWORK_COMMANDS.electron).toContain('electron');
      expect(FRAMEWORK_COMMANDS.electron).toContain('electron-builder');
    });
  });

  // ============================================
  // DATABASE_COMMANDS
  // ============================================

  describe('DATABASE_COMMANDS', () => {
    it('should include PostgreSQL commands', () => {
      expect(DATABASE_COMMANDS.postgresql).toContain('psql');
      expect(DATABASE_COMMANDS.postgresql).toContain('pg_dump');
      expect(DATABASE_COMMANDS.postgresql).toContain('pg_restore');
    });

    it('should include MySQL commands', () => {
      expect(DATABASE_COMMANDS.mysql).toContain('mysql');
      expect(DATABASE_COMMANDS.mysql).toContain('mysqldump');
    });

    it('should include SQLite commands', () => {
      expect(DATABASE_COMMANDS.sqlite).toContain('sqlite3');
    });

    it('should include MongoDB commands', () => {
      expect(DATABASE_COMMANDS.mongodb).toContain('mongo');
      expect(DATABASE_COMMANDS.mongodb).toContain('mongod');
      expect(DATABASE_COMMANDS.mongodb).toContain('mongosh');
    });

    it('should include Redis commands', () => {
      expect(DATABASE_COMMANDS.redis).toContain('redis-cli');
    });

    it('should include Prisma commands', () => {
      expect(DATABASE_COMMANDS.prisma).toContain('prisma');
    });

    it('should include Drizzle commands', () => {
      expect(DATABASE_COMMANDS.drizzle).toContain('drizzle-kit');
    });
  });

  // ============================================
  // INFRASTRUCTURE_COMMANDS
  // ============================================

  describe('INFRASTRUCTURE_COMMANDS', () => {
    it('should include Docker commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.docker).toContain('docker');
      expect(INFRASTRUCTURE_COMMANDS.docker).toContain('docker-compose');
    });

    it('should include Kubernetes commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.kubernetes).toContain('kubectl');
      expect(INFRASTRUCTURE_COMMANDS.kubernetes).toContain('kubeadm');
    });

    it('should include Helm commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.helm).toContain('helm');
      expect(INFRASTRUCTURE_COMMANDS.helm).toContain('helmfile');
    });

    it('should include Terraform commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.terraform).toContain('terraform');
    });

    it('should include Ansible commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.ansible).toContain('ansible');
      expect(INFRASTRUCTURE_COMMANDS.ansible).toContain('ansible-playbook');
    });

    it('should include Vagrant commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.vagrant).toContain('vagrant');
    });
  });

  // ============================================
  // CLOUD_COMMANDS
  // ============================================

  describe('CLOUD_COMMANDS', () => {
    it('should include AWS commands', () => {
      expect(CLOUD_COMMANDS.aws).toContain('aws');
      expect(CLOUD_COMMANDS.aws).toContain('sam');
    });

    it('should include Azure commands', () => {
      expect(CLOUD_COMMANDS.azure).toContain('az');
      expect(CLOUD_COMMANDS.azure).toContain('func');
    });

    it('should include GCP commands', () => {
      expect(CLOUD_COMMANDS.gcp).toContain('gcloud');
      expect(CLOUD_COMMANDS.gcp).toContain('gsutil');
    });

    it('should include Vercel commands', () => {
      expect(CLOUD_COMMANDS.vercel).toContain('vercel');
    });

    it('should include Netlify commands', () => {
      expect(CLOUD_COMMANDS.netlify).toContain('netlify');
    });

    it('should include Heroku commands', () => {
      expect(CLOUD_COMMANDS.heroku).toContain('heroku');
    });
  });

  // ============================================
  // CODE_QUALITY_COMMANDS
  // ============================================

  describe('CODE_QUALITY_COMMANDS', () => {
    it('should include ShellCheck', () => {
      expect(CODE_QUALITY_COMMANDS.shellcheck).toContain('shellcheck');
    });

    it('should include Hadolint', () => {
      expect(CODE_QUALITY_COMMANDS.hadolint).toContain('hadolint');
    });

    it('should include actionlint', () => {
      expect(CODE_QUALITY_COMMANDS.actionlint).toContain('actionlint');
    });

    it('should include yamllint', () => {
      expect(CODE_QUALITY_COMMANDS.yamllint).toContain('yamllint');
    });

    it('should include markdownlint', () => {
      expect(CODE_QUALITY_COMMANDS.markdownlint).toContain('markdownlint');
    });

    it('should include cloc', () => {
      expect(CODE_QUALITY_COMMANDS.cloc).toContain('cloc');
    });

    it('should include tokei', () => {
      expect(CODE_QUALITY_COMMANDS.tokei).toContain('tokei');
    });

    it('should include gitleaks', () => {
      expect(CODE_QUALITY_COMMANDS.gitleaks).toContain('gitleaks');
    });

    it('should include trivy', () => {
      expect(CODE_QUALITY_COMMANDS.trivy).toContain('trivy');
    });
  });

  // ============================================
  // VERSION_MANAGER_COMMANDS
  // ============================================

  describe('VERSION_MANAGER_COMMANDS', () => {
    it('should include asdf', () => {
      expect(VERSION_MANAGER_COMMANDS.asdf).toContain('asdf');
    });

    it('should include mise', () => {
      expect(VERSION_MANAGER_COMMANDS.mise).toContain('mise');
    });

    it('should include nvm', () => {
      expect(VERSION_MANAGER_COMMANDS.nvm).toContain('nvm');
    });

    it('should include fnm', () => {
      expect(VERSION_MANAGER_COMMANDS.fnm).toContain('fnm');
    });

    it('should include n (Node version manager)', () => {
      expect(VERSION_MANAGER_COMMANDS.n).toContain('n');
    });

    it('should include pyenv', () => {
      expect(VERSION_MANAGER_COMMANDS.pyenv).toContain('pyenv');
    });

    it('should include rbenv', () => {
      expect(VERSION_MANAGER_COMMANDS.rbenv).toContain('rbenv');
    });

    it('should include rvm', () => {
      expect(VERSION_MANAGER_COMMANDS.rvm).toContain('rvm');
    });

    it('should include goenv', () => {
      expect(VERSION_MANAGER_COMMANDS.goenv).toContain('goenv');
    });

    it('should include rustup', () => {
      expect(VERSION_MANAGER_COMMANDS.rustup).toContain('rustup');
    });

    it('should include sdkman', () => {
      expect(VERSION_MANAGER_COMMANDS.sdkman).toContain('sdk');
    });

    it('should include jabba', () => {
      expect(VERSION_MANAGER_COMMANDS.jabba).toContain('jabba');
    });

    it('should include fvm', () => {
      expect(VERSION_MANAGER_COMMANDS.fvm).toContain('fvm');
    });
  });

  // ============================================
  // Command Coverage
  // ============================================

  describe('command coverage', () => {
    it('should have commands for all major languages', () => {
      const languages = ['python', 'javascript', 'typescript', 'rust', 'go', 'java', 'ruby', 'php', 'dart'];

      for (const lang of languages) {
        expect(LANGUAGE_COMMANDS[lang]).toBeDefined();
        expect(LANGUAGE_COMMANDS[lang].length).toBeGreaterThan(0);
      }
    });

    it('should have commands for all major package managers', () => {
      const managers = ['npm', 'yarn', 'pnpm', 'bun', 'pip', 'poetry', 'pipenv', 'cargo', 'composer', 'gem'];

      for (const manager of managers) {
        expect(PACKAGE_MANAGER_COMMANDS[manager]).toBeDefined();
        expect(PACKAGE_MANAGER_COMMANDS[manager].length).toBeGreaterThan(0);
      }
    });

    it('should have commands for all major databases', () => {
      const databases = ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'prisma', 'drizzle'];

      for (const db of databases) {
        expect(DATABASE_COMMANDS[db]).toBeDefined();
        expect(DATABASE_COMMANDS[db].length).toBeGreaterThan(0);
      }
    });

    it('should have commands for all major cloud providers', () => {
      const clouds = ['aws', 'azure', 'gcp', 'vercel', 'netlify', 'heroku'];

      for (const cloud of clouds) {
        expect(CLOUD_COMMANDS[cloud]).toBeDefined();
        expect(CLOUD_COMMANDS[cloud].length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Command Safety
  // ============================================

  describe('command safety', () => {
    it('should not include dangerous commands in BASE_COMMANDS', () => {
      expect(BASE_COMMANDS.has('rm -rf /')).toBe(false);
      expect(BASE_COMMANDS.has(':(){ :|:& };:')).toBe(false);
      expect(BASE_COMMANDS.has('dd if=/dev/zero')).toBe(false);
    });

    it('should include safe variants of dangerous commands', () => {
      expect(BASE_COMMANDS.has('rm')).toBe(true);
      expect(BASE_COMMANDS.has('chmod')).toBe(true);
    });

    it('should not include commands that can escape containment', () => {
      expect(BASE_COMMANDS.has('chroot')).toBe(false);
      expect(BASE_COMMANDS.has('mount')).toBe(false);
    });
  });

  // ============================================
  // Data Structure Integrity
  // ============================================

  describe('data structure integrity', () => {
    it('should have consistent array types for all command categories', () => {
      expect(Array.isArray(LANGUAGE_COMMANDS.python)).toBe(true);
      expect(Array.isArray(PACKAGE_MANAGER_COMMANDS.npm)).toBe(true);
      expect(Array.isArray(FRAMEWORK_COMMANDS.react)).toBe(true);
      expect(Array.isArray(DATABASE_COMMANDS.postgresql)).toBe(true);
    });

    it('should have unique commands within each category', () => {
      const uniquePython = new Set(LANGUAGE_COMMANDS.python);
      expect(uniquePython.size).toBe(LANGUAGE_COMMANDS.python.length);
    });

    it('should not have empty arrays for well-known technologies', () => {
      expect(LANGUAGE_COMMANDS.python.length).toBeGreaterThan(0);
      expect(PACKAGE_MANAGER_COMMANDS.npm.length).toBeGreaterThan(0);
      expect(DATABASE_COMMANDS.postgresql.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Framework-Specific Commands
  // ============================================

  describe('framework-specific commands', () => {
    it('should include testing framework commands', () => {
      expect(FRAMEWORK_COMMANDS.jest).toContain('jest');
      expect(FRAMEWORK_COMMANDS.vitest).toContain('vitest');
      expect(FRAMEWORK_COMMANDS.pytest).toContain('pytest');
    });

    it('should include build tool commands', () => {
      expect(FRAMEWORK_COMMANDS.webpack).toContain('webpack');
      expect(FRAMEWORK_COMMANDS.vite).toContain('vite');
      expect(FRAMEWORK_COMMANDS.rollup).toContain('rollup');
    });

    it('should include ORM commands', () => {
      expect(FRAMEWORK_COMMANDS.typeorm).toContain('typeorm');
      expect(FRAMEWORK_COMMANDS.sequelize).toContain('sequelize');
    });
  });

  // ============================================
  // Framework-Specific Testing/Linting Commands
  // ============================================

  describe('framework-specific testing/linting commands', () => {
    it('should include ESLint commands', () => {
      expect(FRAMEWORK_COMMANDS.eslint).toContain('eslint');
    });

    it('should include Prettier commands', () => {
      expect(FRAMEWORK_COMMANDS.prettier).toContain('prettier');
    });

    it('should include Biome commands', () => {
      expect(FRAMEWORK_COMMANDS.biome).toContain('biome');
    });

    it('should include oxlint commands', () => {
      expect(FRAMEWORK_COMMANDS.oxlint).toContain('oxlint');
    });

    it('should include stylelint commands', () => {
      expect(FRAMEWORK_COMMANDS.stylelint).toContain('stylelint');
    });

    it('should include standard commands', () => {
      expect(FRAMEWORK_COMMANDS.standard).toContain('standard');
    });

    it('should include xo commands', () => {
      expect(FRAMEWORK_COMMANDS.xo).toContain('xo');
    });
  });

  // ============================================
  // Cross-Category Consistency
  // ============================================

  describe('cross-category consistency', () => {
    it('should have npm in both language and package manager commands', () => {
      expect(LANGUAGE_COMMANDS.javascript).toContain('npm');
      expect(PACKAGE_MANAGER_COMMANDS.npm).toContain('npm');
    });

    it('should have Python in language commands', () => {
      expect(LANGUAGE_COMMANDS.python).toContain('python');
      expect(LANGUAGE_COMMANDS.python).toContain('python3');
    });

    it('should have docker in infrastructure commands', () => {
      expect(INFRASTRUCTURE_COMMANDS.docker).toContain('docker');
    });
  });
});
