# 0003. This wiki is superseded by the SamuelWiki site (wiki.mcnb.dev)

## Status
Superseded

## Context
This wiki is a frozen, plain-Markdown snapshot (see 0001 and 0002). A separate repository, SamuelWiki, is a VitePress-based documentation site covering the whole HA ecosystem, wired to the custom domain wiki.mcnb.dev. Per the author, this wiki is outdated and no longer maintained; the wiki site is the current documentation venue.

## Decision
Treat this wiki as superseded: it is outdated and no longer maintained (author's stated position, recorded here as-is). Ongoing documentation lives on the wiki site at wiki.mcnb.dev (repository SamuelWiki). This repository is kept around as a historical snapshot rather than deleted, and its knowledge base (this directory) may still grow with new entries.

## Consequences
- New documentation work goes to the wiki site, the service repositories, or HA-Contract — not into these frozen pages.
- Costs and limitations: content overlaps between this repository and the successor site, so the two can diverge; this repository gets no corrections even if a frozen page is wrong, and readers arriving here must be redirected to the site for current facts. "Outdated" here is a neutral lifecycle status, not a quality judgment — the pages remain an accurate pre-split snapshot.
- Because the supersession is recorded only as an author statement plus circumstantial evidence in another repository, nothing in this repository's tooling prevents someone from editing the frozen pages.

## Evidence
- Author statement (owner position): this wiki is outdated, no longer maintained, and replaced by the wiki site at wiki.mcnb.dev (repository SamuelWiki). Nothing in this repository states this — the supersession decision itself is not verified in-repo.
- [`SamuelWiki/package.json`](https://github.com/SamuelCheston/SamuelWiki/blob/main/package.json) (field: docs:dev) — VitePress site (`docs:dev`/`docs:build`/`docs:preview` scripts; `vitepress ^1.6.3`), confirming SamuelWiki is a site repository, not a plain content repo.
- [`SamuelWiki/docs/public/CNAME`](https://github.com/SamuelCheston/SamuelWiki/blob/main/docs/public/CNAME) (field: wiki.mcnb.dev) — `wiki.mcnb.dev`.
- [`SamuelWiki/docs/.vitepress/config.mts`](https://github.com/SamuelCheston/SamuelWiki/blob/main/docs/.vitepress/config.mts) (field: sitemap) — `sitemap.hostname: 'https://wiki.mcnb.dev'`.
- [`SamuelWiki/docs/projects/`](https://github.com/SamuelCheston/SamuelWiki/tree/main/docs/projects/) — ecosystem coverage including `hrpauth/`, `hrpauth-yggdrasil-api/`, `haskinproxy/`, `winnerproxy/`, `ha-contract/` (18 project directories), i.e. the same subjects this wiki covers plus the post-split services.
- Gaps: (1) no statement found in SamuelWiki explicitly declaring that it replaces HRPAuth-Wiki; (2) [xref] [`documentation-layout.md`](https://github.com/SamuelCheston/SamuelWiki/blob/main/docs/projects/ha-contract/documentation-layout.md) names wiki.mcnb.dev "the single home for human-facing documentation" and does not list HRPAuth-Wiki — implicit supersession, still no explicit declaration; (3) that wiki.mcnb.dev actually serves the site is not independently verified beyond the CNAME/config evidence above.
