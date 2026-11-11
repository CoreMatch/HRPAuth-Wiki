# 0006. Render the wiki with VitePress; Markdown stays the single content source

## Status

Accepted (2026-11-08). Supersedes [0001](./0001-plain-markdown-content-repo.md).

## Context

Per [0005](./0005-samuelwiki-retired-venue-restored.md) this repository is the ecosystem's documentation venue again, now carrying current-state pages for the game stack. Serving the repository through GitHub Pages as raw files had two usability defects: the root path answered 404 (there is no `index.html`; GitHub Pages does not promote `README.md`), and every page was served as Markdown source text (`content-type: text/markdown`) — headings, link syntax, and frontmatter visible as literal characters, with no navigation. For human readers the venue was effectively unusable, while machines and AI readers were the only audience that could consume it comfortably. 0001 ("no site generator") was written when the wiki was a frozen snapshot with no new readership; that premise changed with 0005.

## Decision

Add a VitePress rendering layer under these boundaries:

- **Markdown remains the single content source.** The site builds from the same `.md` files at the repository root (`srcDir: '.'`); no second content copy, no parallel docs tree. The existing per-project directories and the frontmatter convention (`title`, `description`, `order`, `tags`, `updatedAt`) are unchanged, and page bodies are not rewritten for rendering.
- **Single language: Chinese.** No duplicated en/zh layers are introduced.
- **Default VitePress theme only, no theme plugins.** The built artifact is self-contained (local search index, system font stack, no runtime CDN dependency), so core reading works offline.
- **Tooling lives in `.vitepress/`** (`config.mts`, `package.json`, `package-lock.json`) so the repository root keeps its existing layout.
- **The homepage is the rendered `README.md`** (VitePress home layout frontmatter plus the existing body): one-line ecosystem positioning, per-project navigation, and reading paths for players, operators, and plugin authors.
- Pages publishing stays on GitHub Pages via the existing `pages.yml`, changed from "upload raw files" to "install dependencies, build, upload the built artifact, deploy", keeping the `push main` and `workflow_dispatch` triggers and the `pages` concurrency group.
- Raw `.md` files remain in the repository for machine/AI consumption and diff-based review; the rendered site is a projection, not a new source. If the site build breaks, the content is still fully available as files.

## Consequences

- The repository gains a Node.js build dependency in CI (`npm ci` inside `.vitepress/`) and a `package-lock.json` there; this is the only toolchain addition.
- Frozen pre-split pages (0002) are rendered too; they carry their freeze notice in-page, and rendering does not unfreeze them — content changes to those directories remain forbidden.
- Dead relative links fail the build, which is treated as a feature (link rot is caught at CI time instead of at read time).
- 0001 is marked superseded with its original text preserved.

## Evidence

- `.vitepress/config.mts` (fields: `srcDir`, `srcExclude`, `lang: 'zh-CN'`, sidebar/nav) and `.vitepress/package.json` (field: `scripts.build` = `vitepress build ..`).
- `.github/workflows/pages.yml` (jobs: build → `npm ci`, `npm run build`, verify `.vitepress/dist/index.html`, upload-pages-artifact, deploy-pages).
- README.md (frontmatter: `layout: home`, hero, three reader features) — body otherwise unchanged.
- knowledge/0001-plain-markdown-content-repo.md (field: ## Status) — marked superseded, original text intact.
