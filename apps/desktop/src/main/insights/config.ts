import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { getBestAvailableProfileEnv } from '../rate-limit-detector';
import { getAPIProfileEnv } from '../services/profile';
import { getOAuthModeClearVars } from '../agent/env-utils';

import { getAugmentedEnv } from '../env-utils';
import { getEffectiveSourcePath } from '../updater/path-resolver';

/**
 * Configuration manager for insights service
 * Handles path detection and environment variable loading
 */
export class InsightsConfig {
  private aperantSourcePath: string = '';

  configure(_pythonPath?: string, aperantSourcePath?: string): void {
    if (aperantSourcePath) {
      this.aperantSourcePath = aperantSourcePath;
    }
  }

  /**
   * Get the aperant source path (detects automatically if not configured)
   * Uses getEffectiveSourcePath() which handles userData override for user-updated backend
   */
  getAperantSourcePath(): string | null {
    if (this.aperantSourcePath && existsSync(this.aperantSourcePath)) {
      return this.aperantSourcePath;
    }

    // Use shared path resolver which handles:
    // 1. User settings (aperantPath)
    // 2. userData override (backend-source) for user-updated backend
    // 3. Bundled backend (process.resourcesPath/backend)
    // 4. Development paths
    const effectivePath = getEffectiveSourcePath();
    if (existsSync(effectivePath) && existsSync(path.join(effectivePath, 'src', 'main', 'ai', 'session', 'runner.ts'))) {
      return effectivePath;
    }

    return null;
  }

  /**
   * Load environment variables from aperant .env file
   */
  loadAperantEnv(): Record<string, string> {
    const aperantSource = this.getAperantSourcePath();
    if (!aperantSource) return {};

    const envPath = path.join(aperantSource, '.env');
    if (!existsSync(envPath)) return {};

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Get complete environment for process execution
   * Includes system env, aperant env, and active Claude profile
   */
  async getProcessEnv(): Promise<Record<string, string>> {
    const aperantEnv = this.loadAperantEnv();
    // Get best available Claude profile environment (automatically handles rate limits)
    const profileResult = getBestAvailableProfileEnv();
    const profileEnv = profileResult.env;
    const apiProfileEnv = await getAPIProfileEnv();
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Use getAugmentedEnv() to ensure common tool paths (claude, dotnet, etc.)
    // are available even when app is launched from Finder/Dock.
    const augmentedEnv = getAugmentedEnv();

    return {
      ...augmentedEnv,
      ...aperantEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
    };
  }
}
