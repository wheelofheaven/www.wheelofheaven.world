#!/usr/bin/env python3
"""
Wrap Greek text with <span class="greek">...</span> so it renders in the
GFS Didot stack defined in the bifrost theme. Mirrors wrap-hebrew.py.

Greek Unicode ranges covered:
- U+0370–U+03FF  Greek and Coptic (basic + monotonic)
- U+1F00–U+1FFF  Greek Extended (polytonic — breathings, accents, iota
                 subscripts; this is what classical Greek uses)
"""

import re
import os

GREEK_PATTERN = re.compile(
    r'([Ͱ-Ͽἀ-῿]+(?:\s*/\s*[Ͱ-Ͽἀ-῿]+)*)'
)


def wrap_greek_in_line(line):
    if 'class="greek"' in line or "class='greek'" in line:
        return line

    # %CE%/%CF% prefix URL-encoded Greek (e.g. Wiktionary links). Don't
    # mutate text inside markdown link targets.
    if '%CE%' in line or '%CF%' in line:
        parts = re.split(r'(\[.*?\]\(.*?\))', line)
        result = []
        for part in parts:
            if part.startswith('[') and '](' in part:
                result.append(part)
            else:
                result.append(GREEK_PATTERN.sub(
                    r'<span class="greek">\1</span>', part))
        return ''.join(result)

    return GREEK_PATTERN.sub(r'<span class="greek">\1</span>', line)


def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    frontmatter_count = 0
    new_lines = []
    modified = False

    for line in lines:
        if line.strip() == '+++':
            frontmatter_count += 1
            new_lines.append(line)
            continue

        if frontmatter_count == 1:
            # Inside frontmatter — leave untouched (description / aliases
            # / arrays would need separate handling and aren't HTML-rendered).
            new_lines.append(line)
            continue

        if re.search(r'[Ͱ-Ͽἀ-῿]', line):
            new_line = wrap_greek_in_line(line)
            if new_line != line:
                modified = True
            new_lines.append(new_line)
        else:
            new_lines.append(line)

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        return True
    return False


def main():
    content_dir = '/Users/zara/Development/github.com/wheelofheaven/www.wheelofheaven.io/content'

    languages = ['', 'de', 'fr', 'es', 'he', 'ru', 'ja', 'zh', 'zh-Hant', 'ko']
    sections = ['wiki', 'timeline', 'essentials', 'explainers', 'articles']

    modified_files = []

    for lang in languages:
        for section in sections:
            dir_path = os.path.join(content_dir, lang, section) if lang \
                else os.path.join(content_dir, section)

            if not os.path.exists(dir_path):
                continue

            for root, _dirs, files in os.walk(dir_path):
                for filename in files:
                    if filename.endswith('.md'):
                        filepath = os.path.join(root, filename)
                        if process_file(filepath):
                            modified_files.append(filepath)
                            print(f"Modified: {filepath}")

    print(f"\nTotal files modified: {len(modified_files)}")


if __name__ == '__main__':
    main()
