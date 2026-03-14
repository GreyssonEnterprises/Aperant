#!/usr/bin/env python3
"""
Complete translation generator using Google Translate via HTTP.
No external dependencies required - uses only standard library.
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict
import time
import hashlib

# Locale configurations
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

# Strings that should NOT be translated
DO_NOT_TRANSLATE = {
    'Aperant', 'Claude', 'GitHub', 'GitLab', 'MCP', 'API', 'JSON', 'OAuth',
    'URL', 'IDE', 'CLI', 'QA', 'PR', 'MR', 'Kanban', 'Anthropic',
}

# Translation cache
TRANSLATION_CACHE = {}

def google_translate(text: str, target_lang: str) -> str:
    """Translate text using Google Translate via HTTP."""
    if not text or not text.strip():
        return text

    # Check cache
    cache_key = f"{target_lang}:{text}"
    if cache_key in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[cache_key]

    # Use Google Translate API
    base_url = "https://translate.googleapis.com/translate_a/single"
    params = {
        'client': 'gtx',
        'sl': 'en',
        'tl': target_lang,
        'dt': 't',
        'q': text
    }

    try:
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(request, timeout=5)

        data = json.loads(response.read().decode('utf-8'))

        if data and data[0]:
            translated = ''.join([item[0] for item in data[0] if item[0]])
            TRANSLATION_CACHE[cache_key] = translated
            return translated
    except Exception as e:
        print(f"\n  Translation error for '{text[:50]}...': {e}")

    return text

def should_translate(text: str) -> bool:
    """Check if text should be translated."""
    if not text or len(text) < 2:
        return False

    # Don't translate single proper nouns
    if text in DO_NOT_TRANSLATE:
        return False

    # Don't translate if it's just a placeholder
    if text.startswith('{{') and text.endswith('}}'):
        return False

    return True

def translate_text(text: str, target_lang: str) -> str:
    """Translate a single text string while preserving placeholders."""
    if not should_translate(text):
        return text

    # Check for placeholders
    import re
    placeholder_pattern = r'\{\{[^}]+\}\}'

    # Find and preserve placeholders
    placeholders = re.findall(placeholder_pattern, text)

    if not placeholders:
        # No placeholders, translate directly
        return google_translate(text, target_lang)

    # Replace placeholders with temporary markers
    temp_text = text
    placeholder_map = {}

    for i, placeholder in enumerate(placeholders):
        marker = f"__P{i}__"
        placeholder_map[marker] = placeholder
        temp_text = temp_text.replace(placeholder, marker)

    # Translate the text
    translated = google_translate(temp_text, target_lang)

    # Restore placeholders
    for marker, original in placeholder_map.items():
        translated = translated.replace(marker, original)

    return translated

def translate_value(value: Any, target_lang: str, stats: dict) -> Any:
    """Recursively translate all string values in a JSON structure."""
    if isinstance(value, str):
        translated = translate_text(value, target_lang)

        if translated != value:
            stats['translated'] += 1
        else:
            stats['skipped'] += 1

        return translated
    elif isinstance(value, dict):
        return {k: translate_value(v, target_lang, stats) for k, v in value.items()}
    elif isinstance(value, list):
        return [translate_value(item, target_lang, stats) for item in value]
    return value

def count_strings(obj) -> int:
    """Count all string values in a JSON structure."""
    if isinstance(obj, str):
        return 1
    elif isinstance(obj, dict):
        return sum(count_strings(v) for v in obj.values())
    elif isinstance(obj, list):
        return sum(count_strings(item) for item in obj)
    return 0

def fix_translation_file(source_path: Path, target_path: Path, locale: str) -> dict:
    """Fix a single translation file by translating all values."""
    stats = {'translated': 0, 'skipped': 0, 'total': 0}

    try:
        with open(source_path, 'r', encoding='utf-8') as f:
            source_data = json.load(f)

        # Count total strings before translation
        stats['total'] = count_strings(source_data)

        # Translate all values recursively
        translated_data = translate_value(source_data, locale, stats)

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

    # Load cache if exists
    cache_file = Path('/tmp/translation-cache.json')
    if cache_file.exists():
        try:
            with open(cache_file, 'r') as f:
                TRANSLATION_CACHE.update(json.load(f))
            print(f"Loaded {len(TRANSLATION_CACHE)} cached translations\n")
        except:
            pass

    total_stats = {}

    for locale_code, lang_code in LOCALE_CODES.items():
        locale_name = LOCALE_NAMES[locale_code]
        locale_path = base_path / locale_code

        if not locale_path.exists():
            print(f"⚠️  Skipping {locale_code} ({locale_name}) - directory not found")
            continue

        print(f"🌐 {locale_code} ({locale_name})")

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
                stats = fix_translation_file(source_file, target_file, locale_code)

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

        # Save cache periodically
        try:
            with open(cache_file, 'w') as f:
                json.dump(TRANSLATION_CACHE, f, ensure_ascii=False)
        except:
            pass

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
