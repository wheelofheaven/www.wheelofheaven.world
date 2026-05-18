#!/usr/bin/env python3
"""
Migrate resources from old Hugo site to new Zola site.
Converts YAML frontmatter to TOML and transforms Hugo relref links to Zola format.
No external dependencies required.
"""

import os
import re
from pathlib import Path

# Paths
OLD_SITE = Path("/Users/zara/Development/github.com/wheelofheaven/wheelofheaven.io/content")
NEW_SITE = Path("/Users/zara/Development/github.com/wheelofheaven/www.wheelofheaven.io/content")

# Language mappings
LANGUAGES = {
    "en": "",  # English is default, no prefix in new site
    "de": "de",
    "fr": "fr",
    "es": "es",
    "ru": "ru",
    "ja": "ja",
    "zh": "zh",
    "zh-Hant": "zh-Hant",
    "ko": "ko",
    "he": "he",
}


def escape_toml_string(s):
    """Escape a string for TOML format."""
    if s is None:
        return '""'
    s = str(s)
    # For multi-line or strings with special chars, use triple quotes
    if '\n' in s or '"""' in s:
        s = s.replace('\\', '\\\\')
        return f'"""\n{s}\n"""'
    # Escape backslashes and quotes
    s = s.replace('\\', '\\\\')
    s = s.replace('"', '\\"')
    return f'"{s}"'


def convert_relref_links(content):
    """Convert Hugo {{< relref >}} links to Zola format."""
    # Pattern to match {{< relref "path/to/file.md" >}}
    relref_pattern = r'\{\{<\s*relref\s+"([^"]+)"\s*>\}\}'

    def replace_relref(match):
        path = match.group(1)
        # Remove .md extension and _index
        path = re.sub(r'/_index\.md$', '/', path)
        path = re.sub(r'\.md$', '/', path)
        # Convert to absolute path format
        if not path.startswith('/'):
            path = '/' + path
        return path

    return re.sub(relref_pattern, replace_relref, content)


def parse_yaml_value(value_str):
    """Parse a YAML value string to Python value."""
    value_str = value_str.strip()

    # Boolean
    if value_str.lower() == 'true':
        return True
    if value_str.lower() == 'false':
        return False

    # Array
    if value_str.startswith('[') and value_str.endswith(']'):
        inner = value_str[1:-1].strip()
        if not inner:
            return []
        # Split by comma, handling quoted strings
        items = []
        current = ''
        in_quotes = False
        quote_char = None
        for char in inner:
            if char in '"\'':
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
                current += char
            elif char == ',' and not in_quotes:
                items.append(current.strip().strip('"\''))
                current = ''
            else:
                current += char
        if current.strip():
            items.append(current.strip().strip('"\''))
        return items

    # Quoted string
    if (value_str.startswith('"') and value_str.endswith('"')) or \
       (value_str.startswith("'") and value_str.endswith("'")):
        return value_str[1:-1]

    # Number
    if re.match(r'^-?\d+$', value_str):
        return int(value_str)
    if re.match(r'^-?\d+\.\d+$', value_str):
        return float(value_str)

    # Plain string
    return value_str


def parse_yaml_frontmatter(content):
    """Parse YAML frontmatter from content (simple parser, no external deps)."""
    if not content.startswith('---'):
        return None, content

    # Find the closing ---
    lines = content.split('\n')
    end_idx = None
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            end_idx = i
            break

    if end_idx is None:
        return None, content

    yaml_lines = lines[1:end_idx]
    body_lines = lines[end_idx + 1:]
    body = '\n'.join(body_lines)

    # Simple YAML parser
    frontmatter = {}
    current_key = None
    current_value = None
    in_multiline = False

    for line in yaml_lines:
        # Skip empty lines and comments
        if not line.strip() or line.strip().startswith('#'):
            continue

        # Skip menu block (Hugo-specific)
        if line.strip().startswith('menu:'):
            in_multiline = True
            continue
        if in_multiline:
            if line.startswith('  ') or line.startswith('\t'):
                continue
            else:
                in_multiline = False

        # Key: value pattern
        match = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$', line)
        if match:
            key = match.group(1)
            value_str = match.group(2).strip()

            if value_str:
                frontmatter[key] = parse_yaml_value(value_str)
            else:
                frontmatter[key] = None

    return frontmatter, body


def frontmatter_to_toml(fm, slug):
    """Convert frontmatter dict to TOML format."""
    lines = ['+++']

    # Required fields
    if 'title' in fm and fm['title']:
        lines.append(f'title = {escape_toml_string(fm["title"])}')

    if 'description' in fm and fm['description']:
        lines.append(f'description = {escape_toml_string(fm["description"])}')

    lines.append('template = "resources-page.html"')
    lines.append(f'slug = "{slug}"')

    # Extra section
    lines.append('')
    lines.append('[extra]')

    # authored_by
    if 'authored_by' in fm and fm['authored_by']:
        authors = fm['authored_by']
        if isinstance(authors, list):
            authors_str = ', '.join(escape_toml_string(a) for a in authors)
            lines.append(f'authored_by = [{authors_str}]')
        else:
            lines.append(f'authored_by = [{escape_toml_string(authors)}]')

    # publish_date
    if 'publish_date' in fm and fm['publish_date'] is not None:
        pd = str(fm['publish_date'])
        lines.append(f'publish_date = "{pd}"')

    # follow_url
    if 'follow_url' in fm and fm['follow_url']:
        lines.append(f'follow_url = "{fm["follow_url"]}"')

    # medium
    if 'medium' in fm and fm['medium']:
        lines.append(f'medium = "{fm["medium"]}"')

    # original_title
    if 'original_title' in fm and fm['original_title']:
        lines.append(f'original_title = {escape_toml_string(fm["original_title"])}')

    # topics
    if 'topics' in fm and fm['topics']:
        topics = fm['topics']
        if isinstance(topics, list):
            topics_str = ', '.join(escape_toml_string(t) for t in topics)
            lines.append(f'topics = [{topics_str}]')

    lines.append('+++')
    return '\n'.join(lines)


def convert_resource_file(src_path, dst_path, slug):
    """Convert a single resource file from Hugo to Zola format."""
    try:
        with open(src_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"  Error reading {src_path}: {e}")
        return False

    # Parse YAML frontmatter
    frontmatter, body = parse_yaml_frontmatter(content)

    if frontmatter is None:
        print(f"  Warning: Could not parse frontmatter for {src_path}")
        return False

    # Convert frontmatter to TOML
    toml_frontmatter = frontmatter_to_toml(frontmatter, slug)

    # Convert Hugo relref links in body
    body = convert_relref_links(body)

    # Combine
    new_content = toml_frontmatter + '\n' + body.lstrip()

    # Write to destination
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    except Exception as e:
        print(f"  Error writing {dst_path}: {e}")
        return False

    return True


def migrate_resources(lang_code):
    """Migrate all resources for a given language."""
    old_resources_dir = OLD_SITE / lang_code / "resources"

    if not old_resources_dir.exists():
        print(f"Warning: Source directory does not exist: {old_resources_dir}")
        return 0

    # Determine new resources directory
    if LANGUAGES[lang_code]:
        new_resources_dir = NEW_SITE / LANGUAGES[lang_code] / "resources"
    else:
        new_resources_dir = NEW_SITE / "resources"

    # Ensure directory exists
    new_resources_dir.mkdir(parents=True, exist_ok=True)

    count = 0

    # Iterate through resource directories
    for item in sorted(old_resources_dir.iterdir()):
        if item.is_dir() and item.name != "topics" and item.name != "medium":
            # Look for index.md in the directory
            index_file = item / "index.md"
            if index_file.exists():
                slug = item.name
                # New flat file structure: resources/slug.md
                dst_path = new_resources_dir / f"{slug}.md"

                print(f"  Converting: {item.name}")
                if convert_resource_file(index_file, dst_path, slug):
                    count += 1

    return count


def main():
    print("Starting resource migration...")
    print(f"Source: {OLD_SITE}")
    print(f"Destination: {NEW_SITE}")
    print()

    total = 0

    for lang_code in LANGUAGES.keys():
        print(f"Processing {lang_code.upper()}...")
        count = migrate_resources(lang_code)
        print(f"  Migrated {count} resources")
        total += count
        print()

    print(f"Total resources migrated: {total}")


if __name__ == "__main__":
    main()
