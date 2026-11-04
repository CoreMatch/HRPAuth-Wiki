# 0002. Freeze wiki content at 2026-10-01, before the Yggdrasil service split

## Status
Accepted

## Date
2026-10-01 (last substantive content commit 525bb206e56aafbb05971afebe31fa05ec61120e)

## Context
In 2026-10 the Yggdrasil compatibility stack was moved out of the HRPAuth core into the separate HRPAuth-Yggdrasil-API service (verified in the read-only HRPAuth repository: the strip-legacy-Yggdrasil-stack commits land on 2026-10-06). The wiki pages, however, were written against the pre-split monolith. Rather than rewriting every page to track the moving code, the wiki content was frozen at its then-current state, and the split was recorded afterwards as attribution annotations.

## Decision
Freeze the wiki content at 2026-10-01. After the freeze, pages are not rewritten to follow the codebase; the only post-freeze change accepted so far is the 2026-11-04 drift-fix pass, which added split-attribution notes (which capability now lives in HRPAuth-Yggdrasil-API / HASkinLib / HASkinProxy) without rewriting structure, language, or remaining content. The freeze itself is stated on the HRPAuth index page.

## Consequences
- The wiki remains a coherent snapshot of the pre-split system, useful as historical reference.
- Costs and limitations: pages describe endpoints, config keys (`yggdrasil.*`), and module layouts that no longer exist in the HRPAuth core; a reader who misses the annotation boxes will get stale facts. Keeping it accurate would have required continuous rewrites across two repositories, which was explicitly declined.
- Because content no longer tracks the code, this wiki cannot serve as the authority for current behavior; authority moved to HA-Contract (see 0004) and live documentation moved to the successor site (see 0003).
- The freeze is a social convention recorded in commit messages and one index line, not enforced by any tooling.

## Evidence
- commit 525bb206e56aafbb05971afebe31fa05ec61120e — feat: add Minecraft 1.19+ profile key support — dated 2026-10-01 18:54:50 +0800; the last substantive content commit (adds HASkinProxy pages, microservices and profile-keys docs, updates configuration/API/architecture/data-models/token/operations pages).
- commit d29a5f615eae190992b6129d29dd5fbd50fa1b35 — docs: update stale facts after the 2026-10 service split — dated 2026-11-04; commit message states verbatim: "The wiki was frozen at 2026-10-01, before the Yggdrasil stack moved out of the HRPAuth core. Without rewriting pages, mark where each capability now lives" and "Structure, language, and remaining content are unchanged".
- commit 5ff6cc5379b588d35d717d9f5126162039615116 — Merge branch 'docs/drift-fix': post-split fact updates — dated 2026-11-04; the only commit after 525bb20 touching content files.
- HRPAuth/index.md:19 — "本 Wiki 内容冻结于 2026-10 拆分前后，涉及 Yggdrasil 的页面已补充归属标注" (freeze statement in the content itself).
- Split timeline cross-check (read-only /home/lnb/Desktop/HA/HRPAuth): commit 9ab4e6494a48e05710cf3699f4de6b675cf35fb5 — refactor: strip legacy Yggdrasil stack and unused cleanup services — dated 2026-10-06 21:15:34 +0800; commit 087030fdd8250404c3bda18fe7acdca6682ecff2 — refactor: remove Minecraft logic and add config v7→8 migration — dated 2026-10-06 23:50:48 +0800. Confirms the freeze (2026-10-01) predates the split (2026-10-06).
- Note on the claimed date: the task brief's "frozen at 2026-10-01" matches the evidence; no discrepancy found. The only nuance is that the annotation pass of 2026-11-04 technically post-dates the freeze while, by its own commit message, not adding content.
