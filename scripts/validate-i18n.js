#!/usr/bin/env node

/**
 * i18n Validation Script
 *
 * Validates all locale files to ensure:
 * - All JSON files are valid
 * - All locales have matching keys with English (source)
 * - No missing translations across namespaces
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LOCALES_DIR = path.join(__dirname, '..', 'apps', 'desktop', 'src', 'shared', 'i18n', 'locales');
const NAMESPACES = [
  'common',
  'navigation',
  'settings',
  'tasks',
  'welcome',
  'onboarding',
  'dialogs',
  'gitlab',
  'taskReview',
  'terminal',
  'errors'
];

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getLocales() {
  try {
    const entries = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name !== 'en')
      .map(entry => entry.name);
  } catch (error) {
    colorLog('red', `Error reading locales directory: ${error.message}`);
    process.exit(1);
  }
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON or file not found: ${error.message}`);
  }
}

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function checkKeysExist(sourceKeys, targetObj, prefix = '') {
  const missing = [];

  for (const key of sourceKeys) {
    const parts = key.split('.');
    let current = targetObj;
    let found = true;

    for (const part of parts) {
      if (!current || !current.hasOwnProperty(part)) {
        found = false;
        break;
      }
      current = current[part];
    }

    if (!found) {
      missing.push(key);
    }
  }

  return missing;
}

function validateNamespace(namespace, locales) {
  const results = {
    namespace,
    totalFiles: 0,
    validFiles: 0,
    invalidFiles: 0,
    missingKeys: [],
    errors: []
  };

  // Read English source file
  const enPath = path.join(LOCALES_DIR, 'en', `${namespace}.json`);
  let sourceData;

  try {
    sourceData = readJsonFile(enPath);
  } catch (error) {
    results.errors.push(`English source file: ${error.message}`);
    return results;
  }

  const sourceKeys = getKeys(sourceData);

  // Check each locale
  for (const locale of locales) {
    results.totalFiles++;
    const localePath = path.join(LOCALES_DIR, locale, `${namespace}.json`);

    try {
      const localeData = readJsonFile(localePath);
      const missing = checkKeysExist(sourceKeys, localeData);

      if (missing.length > 0) {
        results.invalidFiles++;
        results.missingKeys.push({
          locale,
          count: missing.length,
          keys: missing.slice(0, 5) // Show first 5 missing keys
        });
      } else {
        results.validFiles++;
      }
    } catch (error) {
      results.invalidFiles++;
      results.errors.push(`${locale}: ${error.message}`);
    }
  }

  return results;
}

function main() {
  colorLog('cyan', '🌍 i18n Validation Script');
  colorLog('cyan', '='.repeat(50));

  const locales = getLocales();
  colorLog('blue', `Found ${locales.length + 1} locales (including English)`);
  colorLog('blue', `Validating ${NAMESPACES.length} namespaces...\n`);

  let totalFiles = 0;
  let totalValid = 0;
  let totalInvalid = 0;
  let allErrors = [];
  let allMissingKeys = [];

  for (const namespace of NAMESPACES) {
    const result = validateNamespace(namespace, locales);

    totalFiles += result.totalFiles;
    totalValid += result.validFiles;
    totalInvalid += result.invalidFiles;
    allErrors.push(...result.errors);
    allMissingKeys.push(...result.missingKeys);

    // Display results for this namespace
    if (result.errors.length === 0 && result.missingKeys.length === 0) {
      colorLog('green', `✓ ${namespace}.json: All ${result.validFiles} locales valid`);
    } else {
      colorLog('yellow', `⚠ ${namespace}.json: ${result.validFiles}/${result.totalFiles} valid`);

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          colorLog('red', `  ✗ ${error}`);
        }
      }

      if (result.missingKeys.length > 0) {
        for (const missing of result.missingKeys) {
          colorLog('yellow', `  ⚠ ${missing.locale}: Missing ${missing.count} keys`);
          if (missing.keys.length > 0) {
            colorLog('yellow', `    Examples: ${missing.keys.join(', ')}${missing.count > 5 ? '...' : ''}`);
          }
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  colorLog('cyan', 'Summary');
  colorLog('cyan', '='.repeat(50));
  colorLog('blue', `Total files validated: ${totalFiles}`);
  colorLog('green', `Valid: ${totalValid}`);

  if (totalInvalid > 0) {
    colorLog('red', `Invalid: ${totalInvalid}`);
    colorLog('yellow', `\n⚠️  Found issues in ${totalInvalid} file(s)`);

    if (allErrors.length > 0) {
      colorLog('red', `\nErrors:`);
      for (const error of allErrors) {
        colorLog('red', `  ✗ ${error}`);
      }
    }

    if (allMissingKeys.length > 0) {
      colorLog('yellow', `\nMissing keys summary:`);
      const byLocale = {};
      for (const missing of allMissingKeys) {
        if (!byLocale[missing.locale]) {
          byLocale[missing.locale] = { count: 0, files: [] };
        }
        byLocale[missing.locale].count += missing.count;
        byLocale[missing.locale].files.push(missing.count);
      }

      for (const [locale, data] of Object.entries(byLocale)) {
        colorLog('yellow', `  ${locale}: ${data.count} missing keys across ${data.files.length} namespace(s)`);
      }
    }

    colorLog('red', '\n❌ Validation failed');
    process.exit(1);
  } else {
    colorLog('green', '\n✅ All validations passed!');
    colorLog('green', `All ${locales.length + 1} locales have complete translations for all ${NAMESPACES.length} namespaces`);
    process.exit(0);
  }
}

// Run the script
main();
