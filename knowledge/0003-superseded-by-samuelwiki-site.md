# 0003. This wiki is superseded by the SamuelWiki site (wiki.mcnb.dev)

## Status
Superseded

## Date
not verified (no commit in this repository records the supersession decision; it is an author statement. The successor site's canonical-domain commit is dated 2026-11-04.)

## Context
This wiki is a frozen, plain-Markdown snapshot (see 0001 and 0002). Meanwhile a separate repository, SamuelWiki, was built into a VitePress-based documentation site covering the whole HA ecosystem, and was wired to the custom domain wiki.mcnb.dev. Per the author, this wiki is outdated and no longer maintained; the wiki site is the current documentation venue.

## Decision
Treat this wiki as superseded: it is outdated and no longer maintained (author's stated position, recorded here as-is). Ongoing documentation lives on the wiki site at wiki.mcnb.dev (repository SamuelWiki). This repository is kept around as a historical snapshot rather than deleted, and its knowledge base (this directory) may still grow with retrospective entries.

## Consequences
- New documentation work should go to the wiki site, the service repositories, or HA-Contract — not into these frozen pages.
- Costs and limitations: content now overlaps between this repository and the successor site, so the two can diverge; this repository gets no corrections even if a frozen page is wrong, and readers arriving here must be redirected to the site for current facts. "Outdated" here is a neutral lifecycle status, not a quality judgment — the pages remain an accurate pre-split snapshot.
- Because the supersession is recorded only as an author statement plus circumstantial evidence in another repository, nothing in this repository's tooling prevents someone from editing the frozen pages.

## Evidence
- Author statement (task brief / owner position): this wiki is outdated, no longer maintained, and replaced by the wiki site at wiki.mcnb.dev (repository SamuelWiki). No commit in this repository states this — the supersession decision itself is not verified in-repo.
- /home/lnb/Desktop/HA/SamuelWiki/package.json:6-11 — VitePress site (`docs:dev`/`docs:build`/`docs:preview` scripts; `vitepress ^1.6.3`), confirming SamuelWiki is a site repository, not a plain content repo.
- /home/lnb/Desktop/HA/SamuelWiki/docs/public/CNAME:1 — `wiki.mcnb.dev`.
- /home/lnb/Desktop/HA/SamuelWiki/docs/.vitepress/config.mts:10 — `sitemap.hostname: 'https://wiki.mcnb.dev'`.
- /home/lnb/Desktop/HA/SamuelWiki commit 8514c06027d85620ce6f1bc79dea8c77f9512274 — site: add canonical domain config for wiki.mcnb.dev — dated 2026-11-04; introduces the CNAME and sitemap hostname above.
- /home/lnb/Desktop/HA/SamuelWiki commit 6b0ca10b2d2e4c2d83d174d5f03962e54d54e2ac — refactor: migrate from custom React wiki to VitePress docs site — dated 2026-10-03.
- /home/lnb/Desktop/HA/SamuelWiki docs/projects/ — ecosystem coverage including `hrpauth/`, `hrpauth-yggdrasil-api/`, `haskinproxy/`, `winnerproxy/`, `ha-contract/` (18 project directories), i.e. the same subjects this wiki covers plus the post-split services; commit c10e4c53069300cf3ae831c074f70793fbc8cf8f — docs: import HRPAuth config/migrations and WinnerProxy config facts — dated 2026-11-04, with message "Docs centralization: deployment/operations content no longer lives in service repositories".
- Gaps: (1) no statement found in SamuelWiki explicitly declaring that it replaces HRPAuth-Wiki; (2) SamuelWiki docs/projects/ha-contract/documentation-layout.md:10 still lists "CoreMatch/HRPAuth-Wiki: a separate content repository for human developers", which is consistent with coexistence rather than explicit replacement — flagged for author confirmation; (3) that wiki.mcnb.dev actually serves the site is not independently verified beyond the CNAME/config evidence above.
