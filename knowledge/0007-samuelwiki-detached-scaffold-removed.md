# 0007. SamuelWiki fully detached from HA; remaining scaffold removed

## Status

Accepted (2026-11-11).

## Context

[0005](./0005-samuelwiki-retired-venue-restored.md) retired SamuelWiki and restored this repository as the documentation venue; [0006](./0006-rendering-layer-over-markdown.md) added the VitePress rendering layer and left the foreign SamuelWiki scaffold (`docs/`, root `package.json`/`package-lock.json`) in place, excluded via `srcExclude`. The root manifest pair was removed on 2026-11-11 (commit `6abacfc`). The author now confirms SamuelWiki is entirely unrelated to HA. The custom domain `wiki.mcnb.dev` serves this repository's Pages site (verified 2026-11-11: served title "HRPAuth-Wiki").

## Decision

Remove the remaining SamuelWiki traces from this repository:

- Delete the `docs/` scaffold in full (tracked pages, theme and config, plus untracked build/cache remnants).
- Drop `docs/**` from `srcExclude` and the scaffold comment in `.vitepress/config.mts`.
- Reader-facing documentation links in service repositories point at this site's current `/deploy/` and `/dev/` pages on `wiki.mcnb.dev`, not the old SamuelWiki `/projects/` paths.

## Consequences

- No SamuelWiki content or tooling remains in this repository. Entries 0003 and 0005 stay as the historical record of the venue change; 0006's scaffold clauses are trimmed to current state per the maintenance rule.
- `srcExclude` is now `['node_modules/**', '.github/**', 'build/**']`.

## Evidence

- `.vitepress/config.mts` (fields: `srcDir`, `srcExclude`) — no `docs/**`.
- `docs/` absent from the working tree and the index.
- `https://wiki.mcnb.dev` — served title "HRPAuth-Wiki" (checked 2026-11-11).
- Author statement (2026-11-11): SamuelWiki is no longer related to HA.