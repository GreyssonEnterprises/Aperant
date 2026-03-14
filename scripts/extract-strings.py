#!/usr/bin/env python3
"""
Extract all unique strings from English translation files
to create comprehensive translation dictionaries.
"""

import json
from pathlib import Path
from collections import defaultdict

def extract_all_strings(data, parent_key=''):
    """Recursively extract all string values from a JSON structure."""
    strings = {}

    if isinstance(data, dict):
        for key, value in data.items():
            current_key = f"{parent_key}.{key}" if parent_key else key
            if isinstance(value, str):
                strings[current_key] = value
            elif isinstance(value, (dict, list)):
                strings.update(extract_all_strings(value, current_key))
    elif isinstance(data, list):
        for i, item in enumerate(data):
            current_key = f"{parent_key}[{i}]" if parent_key else f"[{i}]"
            if isinstance(item, str):
                strings[current_key] = item
            elif isinstance(item, (dict, list)):
                strings.update(extract_all_strings(item, current_key))

    return strings

def main():
    """Extract all unique strings from English translation files."""
    base_path = Path('/opt/dev/Aperant/.worktrees/i18n-additional-languages/apps/desktop/src/shared/i18n/locales')
    en_path = base_path / 'en'

    all_strings = {}
    namespaces = []

    for json_file in sorted(en_path.glob('*.json')):
        namespace = json_file.stem
        namespaces.append(namespace)

        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        strings = extract_all_strings(data)
        all_strings[namespace] = strings

        print(f"\n{namespace}.json ({len(strings)} strings):")
        for key, value in sorted(strings.items())[:10]:  # Show first 10
            print(f"  {key}: {value[:60]}..." if len(value) > 60 else f"  {key}: {value}")

    # Write to file for processing
    output_file = Path('/tmp/all-english-strings.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_strings, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Extracted {sum(len(s) for s in all_strings.values())} total strings across {len(namespaces)} namespaces")
    print(f"📝 Written to {output_file}")

if __name__ == '__main__':
    main()
