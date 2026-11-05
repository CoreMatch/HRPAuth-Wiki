# 0001. Keep the wiki a hand-maintained, plain-Markdown content repository

## Status
Accepted

## Date
2026-08-15

## Context
HRPAuth-Wiki exists as a dedicated documentation repository for the HRPAuth ecosystem. Documentation could either be generated into a site (VitePress/mkdocs/Docusaurus style) or kept as plain files. The repository holds a one-line README, an AGPL-3.0 LICENSE, and all documentation as plain Markdown files. Pages carry YAML frontmatter (`title`, `description`, `order`, `tags`, `updatedAt`), but nothing in this repository consumes it.

## Decision
Keep the repository a hand-maintained, plain-Markdown content repository with no site generator, no build pipeline, and no CI. Content is organized one directory per project:

- `HRPAuth/` (11 pages): index/overview, quick-start (install and local run), architecture, configuration, token system (OAuth2 + Yggdrasil), API overview, data models, feature flags, operations, microservice extension, profile keys (Minecraft 1.19+ chat signatures).
- `HASkinProxy/` (2 pages): index and API reference for the CustomSkinLoader compatibility proxy.
- `WinnerProxy/` (7 pages): index, architecture, data flow, configuration, deployment, troubleshooting, API reference; pages are manually bilingual with separate Chinese and English sections.

Coverage is therefore: installation/quick-start, configuration, architecture, HTTP API, data models, tokens/OAuth2, feature flags, operations, microservice extension, and profile keys for the HRPAuth core, plus the two adjacent proxies. Yggdrasil is documented inside the HRPAuth pages from the pre-split perspective (see 0002); HASkinLib is mentioned but has no dedicated page.

## Consequences
- Zero toolchain: no dependencies to install, no build to break; content is reviewed as plain diffs.
- Costs and limitations: no rendering site, search, or link checking from this repository; presentation depends on whatever viewer renders the files. Bilingual content is duplicated by hand (WinnerProxy pages) and can drift. The frontmatter is inert here — it only matters if some external tool imports the files.
- Richer presentation is provided by a separate site repository instead of a generator added here (see 0003).

## Evidence
- README.md (field: # HRPAuth-Wiki) — the entire README is the single line `# HRPAuth-Wiki`.
- LICENSE (field: GNU AFFERO GENERAL PUBLIC LICENSE) — GNU Affero General Public License Version 3.
- Verified file inventory (full repository listing inspected): exactly 21 Markdown files — README.md plus 20 content pages (HRPAuth/ 11, HASkinProxy/ 2, WinnerProxy/ 7).
- Verified absence: no package.json, mkdocs.yml, docusaurus config, Gemfile, CI workflow, or any hidden file anywhere in the repository (full listing plus dotfile scan).
- HRPAuth/index.md (field: updatedAt) — YAML frontmatter (`title`/`order`/`tags`/`updatedAt`) with no in-repo consumer.
- WinnerProxy/configuration.md (field: ## 中文) and WinnerProxy/configuration.md (field: ## English) — manual bilingual layout (`## 中文` / `## English`).
