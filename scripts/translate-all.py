#!/usr/bin/env python3
"""
Complete translation generator using deep-translator library.
Translates ALL English strings to all 19 target locales.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, Set

try:
    from deep_translator import GoogleTranslator
except ImportError:
    print("Installing deep-translator...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'deep-translator', '-q'])
    from deep_translator import GoogleTranslator

# Locale configurations with Google Translate language codes
LOCALE_CODES = {
    'de': 'de',
    'es': 'es',
    'hi': 'hi',
    'id': 'id',
    'it': 'it',
    'ja': 'ja',
    'ko': 'ko',
    'nl': 'nl',
    'no': 'no',
    'pl': 'pl',
    'pt-BR': 'pt',
    'pt-PT': 'pt',
    'ru': 'ru',
    'th': 'th',
    'tr': 'tr',
    'uk': 'uk',
    'vi': 'vi',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
}

LOCALE_NAMES = {
    'de': 'German',
    'es': 'Spanish',
    'hi': 'Hindi',
    'id': 'Indonesian',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'nl': 'Dutch',
    'no': 'Norwegian',
    'pl': 'Polish',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    'ru': 'Russian',
    'th': 'Thai',
    'tr': 'Turkish',
    'uk': 'Ukrainian',
    'vi': 'Vietnamese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
}

# Strings that should NOT be translated (proper nouns, technical terms)
DO_NOT_TRANSLATE = {
    'Aperant', 'Claude', 'GitHub', 'GitLab', 'MCP', 'API', 'JSON', 'OAuth',
    'URL', 'IDE', 'CLI', 'QA', 'PR', 'MR', 'Kanban', 'Roadmap', 'Changelog',
    'Anthropic', 'OpenRouter', 'Groq', 'z.AI', 'Graphiti', 'Vercel', 'Biome',
    'Vite', 'Vitest', 'Playwright', 'xterm.js', 'Framer Motion', 'Radix UI',
    'Tailwind CSS', 'TypeScript', 'JavaScript', 'Python', 'React', 'Electron',
    'Git', 'bash', 'zsh', 'PowerShell', 'fish', 'NuShell',
}

# Cache for translations to avoid redundant API calls
TRANSLATION_CACHE = {}

def should_translate(text: str) -> bool:
    """Check if text should be translated."""
    if not text or len(text) < 2:
        return False

    # Don't translate if it's just a number or special characters
    if text.strip().isdigit() or all(c in '{}<>=+-/*&|!@#$%^&()[]{}"\':;,.?~`' for c in text):
        return False

    # Don't translate single words that are proper nouns
    words = text.split()
    if len(words) == 1 and text in DO_NOT_TRANSLATE:
        return False

    return True

def translate_text(text: str, target_lang: str, translator=None) -> str:
    """Translate a single text string."""
    if not should_translate(text):
        return text

    # Check cache
    cache_key = f"{target_lang}:{text}"
    if cache_key in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[cache_key]

    # Preserve placeholders like {{variable}}
    placeholders = []
    temp_text = text

    # Find all placeholders
    import re
    placeholder_pattern = r'\{\{[^}]+\}\}'
    found_placeholders = re.findall(placeholder_pattern, temp_text)

    for i, placeholder in enumerate(found_placeholders):
        placeholder_marker = f"__PLACEHOLDER_{i}__"
        placeholders.append((placeholder_marker, placeholder))
        temp_text = temp_text.replace(placeholder, placeholder_marker)

    # Translate if needed
    if translator and temp_text:
        try:
            translated = translator.translate(temp_text)
        except Exception as e:
            print(f"  Translation error: {e}")
            translated = temp_text
    else:
        translated = temp_text

    # Restore placeholders
    for marker, original in placeholders:
        translated = translated.replace(marker, original)

    # Cache the result
    TRANSLATION_CACHE[cache_key] = translated
    return translated

def translate_value(value: Any, target_lang: str, translator, stats: dict) -> Any:
    """Recursively translate all string values in a JSON structure."""
    if isinstance(value, str):
        translated = translate_text(value, target_lang, translator)

        if translated != value:
            stats['translated'] += 1
        else:
            stats['skipped'] += 1

        return translated
    elif isinstance(value, dict):
        return {k: translate_value(v, target_lang, translator, stats) for k, v in value.items()}
    elif isinstance(value, list):
        return [translate_value(item, target_lang, translator, stats) for item in value]
    return value

def fix_translation_file(source_path: Path, target_path: Path, locale: str, translator) -> dict:
    """Fix a single translation file by translating all values."""
    stats = {'translated': 0, 'skipped': 0, 'total': 0}

    try:
        with open(source_path, 'r', encoding='utf-8') as f:
            source_data = json.load(f)

        # Translate all values recursively
        translated_data = translate_value(source_data, locale, translator, stats)

        # Count total strings
        def count_strings(obj):
            if isinstance(obj, str):
                return 1
            elif isinstance(obj, dict):
                return sum(count_strings(v) for v in obj.values())
            elif isinstance(obj, list):
                return sum(count_strings(item) for item in obj)
            return 0

        stats['total'] = count_strings(source_data)

        # Write the fixed translation
        with open(target_path, 'w', encoding='utf-8') as f:
            json.dump(translated_data, f, ensure_ascii=False, indent=2)

        stats['success'] = True
    except Exception as e:
        stats['error'] = str(e)
        stats['success'] = False

    return stats

def main():
    """Fix all translation files for all locales using Google Translate."""
    base_path = Path('/opt/dev/Aperant/.worktrees/i18n-additional-languages/apps/desktop/src/shared/i18n/locales')
    en_path = base_path / 'en'

    # Get all namespaces
    namespaces = sorted([f.stem for f in en_path.glob('*.json')])

    print(f"Found {len(namespaces)} namespaces: {', '.join(namespaces)}")
    print(f"Translating to {len(LOCALE_NAMES)} locales using Google Translate...")
    print(f"{'='*60}\n")

    total_stats = {}

    for locale_code, lang_code in LOCALE_CODES.items():
        locale_name = LOCALE_NAMES[locale_code]
        locale_path = base_path / locale_code

        if not locale_path.exists():
            print(f"⚠️  Skipping {locale_code} ({locale_name}) - directory not found")
            continue

        print(f"🌐 {locale_code} ({locale_name})")

        # Create translator for this locale
        try:
            translator = GoogleTranslator(source='en', target=lang_code)
        except Exception as e:
            print(f"  ✗ Failed to create translator: {e}")
            continue

        locale_stats = {
            'translated': 0,
            'skipped': 0,
            'total': 0,
            'files': 0,
            'errors': 0
        }

        for namespace in namespaces:
            source_file = en_path / f"{namespace}.json"
            target_file = locale_path / f"{namespace}.json"

            if source_file.exists() and target_file.exists():
                print(f"  → Translating {namespace}.json...", end='\r')
                stats = fix_translation_file(source_file, target_file, locale_code, translator)

                if stats['success']:
                    locale_stats['translated'] += stats['translated']
                    locale_stats['skipped'] += stats['skipped']
                    locale_stats['total'] += stats['total']
                    locale_stats['files'] += 1

                    coverage = (stats['translated'] / stats['total'] * 100) if stats['total'] > 0 else 0
                    print(f"  ✓ {namespace}.json: {stats['translated']}/{stats['total']} strings ({coverage:.0f}%)")
                else:
                    locale_stats['errors'] += 1
                    print(f"  ✗ {namespace}.json: {stats.get('error', 'failed')}")

        total_stats[locale_code] = locale_stats
        print()  # Empty line between locales

    # Final summary
    print(f"{'='*60}")
    print("TRANSLATION SUMMARY")
    print(f"{'='*60}")

    for locale_code in sorted(LOCALE_NAMES.keys()):
        if locale_code not in total_stats:
            continue

        stats = total_stats[locale_code]
        if stats['files'] > 0:
            coverage = (stats['translated'] / stats['total'] * 100) if stats['total'] > 0 else 0
            print(f"{locale_code:8} ({LOCALE_NAMES[locale_code]:25}): {stats['translated']:4}/{stats['total']:4} strings ({coverage:5.1f}%)")

    print(f"\n✅ Translation complete!")
    print(f"📝 Cache size: {len(TRANSLATION_CACHE)} entries")

if __name__ == '__main__':
    main()
