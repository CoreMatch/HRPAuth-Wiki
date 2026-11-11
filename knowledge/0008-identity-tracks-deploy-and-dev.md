# 0008. Identity tracks: /deploy/ and /dev/ are physically separate

## Status

Accepted (split landed 2026-11-08, commit `6b803c2`; recorded 2026-11-12).
Supersedes the per-project-layout clause of [0005](./0005-samuelwiki-retired-venue-restored.md)
and the homepage clause of [0006](./0006-rendering-layer-over-markdown.md).

## Context

After [0005](./0005-samuelwiki-retired-venue-restored.md) and
[0006](./0006-rendering-layer-over-markdown.md) the revived wiki used one
directory per project (`<Project>/index.md`, `deployment.md`,
`development.md`). The site was reorganized into identity tracks: pages now
live per track, one flat file per project, and the two tracks never surface
each other's content. No earlier knowledge entry recorded the structure.

## Decision

Current layout:

- Two identity tracks: `/deploy/` (部署者) and `/dev/` (开发者). One flat
  page per project per track (`deploy/<project>.md`, `dev/<project>.md`);
  the per-project directories were removed by the split.
- `README.md` is the entry page: one-line positioning, identity choice
  (我是部署者 / 我是开发者), and a plain project list without per-project
  doc links.
- Sidebars are per-track and contain no cross-track entries; each track ends
  with one understated link (↩ 重选身份) back to the entry page. Footer
  prev/next follows the current sidebar and never crosses tracks
  (`.vitepress/config.mts`).
- Every project in the ecosystem project list carries both track pages,
  including the plugin-kind products (MatchCoreArena-VelocityGate,
  BedwarsRel-MCA).
- The frozen pre-split directories (`HRPAuth/`, `HASkinProxy/`,
  `WinnerProxy/`) stay at the repository root per
  [0002](./0002-content-frozen-before-service-split.md): rendered and
  searchable, but outside both track sidebars and reachable only by direct
  URL.
- `knowledge/` stays out of navigation per
  [0006](./0006-rendering-layer-over-markdown.md), reachable by direct URL
  (`/knowledge/`) and site search.

## Consequences

- Adding a project means two pages (one per track), two sidebar entries, two
  index lists (`deploy/index.md`, `dev/index.md`), and one README project
  list entry; the two pages can drift, the same cost as the bilingual
  duplication noted in 0002-era entries.
- A reader who enters one track never sees the other track's pages in
  navigation; cross-track discovery is only via search or direct URL.
- Costs and limitations: content that serves both identities (e.g. the
  platform image publication facts) must be placed in one track and accepted
  as invisible from the other's navigation.

## Evidence

- Commit `6b803c2` ("docs: split site into identity tracks /deploy/ and
  /dev/"): pages moved to `deploy/<project>.md` and `dev/<project>.md`,
  per-project directories removed, sidebars per-track.
- `.vitepress/config.mts` (fields: `sidebar['/deploy/']`,
  `sidebar['/dev/']`) — per-track sidebars, each ending with ↩ 重选身份.
- `README.md` — entry page: identity choice plus plain project list.
- `deploy/index.md`, `dev/index.md` — per-track project indexes.
- File inventory (2026-11-12): `deploy/` 16 pages, `dev/` 17 pages
  (including `rw-mod-injector-regression.md`).
