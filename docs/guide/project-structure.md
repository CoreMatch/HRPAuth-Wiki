# Project Structure

Below is an overview of the main directories and what they are responsible for.

## Directory Overview

```text
docs/
  .vitepress/
    config.mts         # Site config, nav, sidebar, search, locale settings
    theme/
      index.ts         # Custom theme entry
      style.css        # Site style extensions
  guide/               # Onboarding and maintenance guides
  reference/           # Architecture, content model, deployment references
  zh/                  # Chinese localized pages
  index.md             # Home page
  faq.md               # FAQ
  changelog.md         # Changelog
  about.md             # About page
```

## Content Organization Guidance

- `guide/`: task-oriented pages that explain how to do something
- `reference/`: stable pages that explain what something is and why it exists
- top-level single pages: useful for FAQ, changelog, and about-style content

## How to Extend It

When adding a new documentation section, this is a good default workflow:

1. Create a matching directory under `docs/`
2. Add an `index.md` page as the section entry
3. Register subpages in the sidebar inside `config.mts`
4. Add entry links from the home page or related sections
