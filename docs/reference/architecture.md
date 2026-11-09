# Site Architecture

This wiki site is built with VitePress and follows a typical static-site architecture.

## Layers

### Content Layer

Pages are written in Markdown, which is a good fit for guides, standards, FAQs, and reference material.

### Configuration Layer

`docs/.vitepress/config.mts` manages:

- top navigation
- sidebars
- search
- footer
- outline and document navigation
- locale switching

### Presentation Layer

The custom theme files inside `docs/.vitepress/theme/` handle the home page cards and global visual tweaks.

## Why It Works Well for a Wiki

- Content and structure live in version control, which helps collaboration and traceability
- The build output is static, so deployment stays simple
- Search, navigation, and page outlines are already mature
- Non-frontend teammates can still contribute through Markdown
