![wheel-of-heaven-banner](https://github.com/wheelofheaven/.github/blob/main/profile/static/wheel-of-heaven-banner.jpg)

# Wheel of Heaven | Website

This repository contains the source code for the Wheel of Heaven website, a multilingual reading of the ancient world's creation traditions through the working hypothesis that the beings called Elohim were a small advanced human civilization that came here, designed life on Earth, and left a record in the religious texts. The site is built using Zola, a fast Rust-based static site generator.

## Project Structure

The Wheel of Heaven website is structured as follows:

- `content/`: Contains all the markdown files which make up the content of the site. This includes articles, wiki entries, and other written materials.
- `static/`: Hosts all static content like images, CSS files, and JavaScript files.
- `templates/`: Holds the Tera templates that define the structure of different page types.
- `sass/`: SCSS stylesheets organized using the 7-1 pattern.
- `data/`: Stores JSON data files including the library catalog and book content.
- `tools/`: Python CLI utilities for managing translations and catalog.
- `config.toml`: The main configuration file for Zola with global settings and translations.

## Contributing

We welcome contributions to the Wheel of Heaven project! Whether it's adding content, improving the design, or fixing bugs, your input is valuable.

Start with the **[developer documentation at docs.wheelofheaven.world](https://docs.wheelofheaven.world)** — it covers the [Quickstart](https://docs.wheelofheaven.world/getting-started/quickstart/), the [Project Map](https://docs.wheelofheaven.world/getting-started/project-map/) of how the ~19 repos in this organization fit together, per-content-type how-tos for [wiki entries](https://docs.wheelofheaven.world/contributing/content/wiki-entry/) / [Articles](https://docs.wheelofheaven.world/contributing/content/article/) / [Newsroom Dispatches](https://docs.wheelofheaven.world/contributing/content/newsroom-dispatch/), and the [Bifrost theme guide](https://docs.wheelofheaven.world/contributing/dev/bifrost-theme/) for theme/SCSS work.

## Usage

To build this site locally:

1. Install [mise](https://mise.jdx.dev/) on your machine.
2. Clone this repository.
3. Navigate to the repository directory and run `mise run build`.
4. To start the dev server: `mise run serve` (opens at `http://localhost:1199`).

## Translation Tools

The project includes a CLI utility for managing translations of library texts.

### Setup

```bash
# Install Python dependencies (requires Python 3.12+ and uv)
mise run setup-tools
```

### Basic Commands

```bash
# Show translation status for all books
mise run translate status

# Show detailed status for a specific book
mise run translate status the-book-which-tells-the-truth -l de

# Show paragraphs missing translation
mise run translate missing the-book-which-tells-the-truth de

# Edit a specific paragraph translation
mise run translate edit the-book-which-tells-the-truth 1:5 -l de

# Export translations for external editing
mise run translate export the-book-which-tells-the-truth de -f json

# Import translations from export file
mise run translate import translations.json
```

### LLM-Assisted Translation

The CLI supports automatic translation using multiple LLM providers:

| Provider | API Key Environment Variable | Notes |
|----------|------------------------------|-------|
| Claude | `ANTHROPIC_API_KEY` | Default provider, excellent for nuanced religious texts |
| OpenAI | `OPENAI_API_KEY` | GPT-4o default model |
| Ollama | N/A | Local models, no API key needed |
| DeepL | `DEEPL_API_KEY` | Fast, no context support |

```bash
# Check available providers
mise run translate providers

# Translate a single paragraph
mise run translate auto the-book-which-tells-the-truth -l de --ref 1:5

# Translate an entire chapter
mise run translate auto the-book-which-tells-the-truth -l de --chapter 3

# Batch translate missing paragraphs with review
mise run translate auto the-book-which-tells-the-truth -l de --batch --review

# Use a specific provider and model
mise run translate auto the-book-which-tells-the-truth -l de -p openai -m gpt-4-turbo

# Dry run (preview without saving)
mise run translate auto the-book-which-tells-the-truth -l de --batch --dry-run
```

### Installing Provider Dependencies

```bash
# Install all LLM providers
uv pip install -e ".[all-llm]"

# Or install specific providers
uv pip install -e ".[claude]"
uv pip install -e ".[openai]"
uv pip install -e ".[ollama]"
uv pip install -e ".[deepl]"
```

## Reporting Issues

If you encounter any issues or have suggestions for improvements, please file an issue in this repository's Issue Tracker.

## Stay Connected

Keep up with the latest developments in our project:

- [Telegram | t.me/wheelofheaven](https://t.me/wheelofheaven)
- [X | @wheelofheaven](https://x.com/wheelofheaven)
- [GitHub | wheelofheaven](https://github.com/wheelofheaven)


## Attribution

This website is powered by [Zola](https://www.getzola.org/), a static site generator written in Rust.

## License

Released under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Public Domain), in line with the rest of the Wheel of Heaven org.
