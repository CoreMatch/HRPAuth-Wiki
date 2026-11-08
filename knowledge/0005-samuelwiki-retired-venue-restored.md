# 0005. SamuelWiki retired; this wiki is the documentation venue again

## Status

Accepted (2026-11-08, author decision)

## Context

Entry 0003 recorded that this wiki was superseded by the SamuelWiki site (`wiki.mcnb.dev`, repository `SamuelCheston/SamuelWiki`) and no longer maintained. The author has since retired the SamuelWiki repository as a documentation venue: the ecosystem content written there on 2026-11-08 (the game-services section and the Deployer/MaintenanceView current-state updates) was reverted out of it the same day, and that repository is to be treated as deprecated for documentation purposes. The ecosystem's current-state documentation for the game stack (Avalon, Cascade, RW-Mod-Injector, HA-Services-Deployer, HA-Services-MaintenanceView) needs a venue.

## Decision

This repository is the documentation venue for the ecosystem again. Current-state pages are added as new per-project directories alongside the frozen ones: `Avalon/`, `Cascade/`, `RW-Mod-Injector/`, `HA-Services-Deployer/`, `HA-Services-MaintenanceView/`. The frozen pre-split directories (`HRPAuth/`, `HASkinProxy/`, `WinnerProxy/`) stay frozen per 0002: they are not rewritten to chase the codebase. The plain-Markdown, no-site-generator shape of the repository per 0001 is kept.

## Consequences

- The wiki grows again beyond the frozen snapshot; new pages follow the existing per-project layout, Chinese prose, and frontmatter convention (`title`, `description`, `order`, `tags`, `updatedAt`).
- 0003 is reversed by this entry; it stays in the knowledge base as the record of the earlier decision.
- The `wiki.mcnb.dev` domain is still bound to the retired SamuelWiki's GitHub Pages site at the time of writing; moving the binding to this repository's Pages site is an owner console action (remove the custom domain from `SamuelCheston/SamuelWiki` Settings → Pages, add it to `CoreMatch/HRPAuth-Wiki` Settings → Pages, and point the Cloudflare origin at `corematch.github.io`). Until then this repository's Pages content is served on its default domain only.
- This repository's Pages hosting serves the raw Markdown files (no site generator per 0001); adopting a rendered site would require revisiting 0001 first.

## Evidence

- `SamuelCheston/SamuelWiki` revert merge `15c58ab` ("Merge branch 'revert/game-services-content-20261108': revert game services section (moved to the project wiki)"), reverting merge `c943d27`; the repository's own `TODO.md` and `knowledge/0003` in this repository document the earlier supersession.
- New pages in this repository: `Avalon/index.md`, `Avalon/plugins.md`, `Cascade/index.md`, `RW-Mod-Injector/index.md`, `RW-Mod-Injector/regression.md`, `HA-Services-Deployer/index.md`, `HA-Services-MaintenanceView/index.md`; entry point `README.md`.
- GitHub Pages state at write time: `CoreMatch/HRPAuth-Wiki` Pages enabled (`build_type: workflow`, no custom domain bound); `SamuelCheston/SamuelWiki` Pages still holding `cname: wiki.mcnb.dev`.
- All migrated facts were taken from the source repositories (Avalon, Cascade, RW-Mod-Injector, HA-Services-Deployer, HA-Services-MaintenanceView) with `file::symbol` anchors, not from the retired site.
