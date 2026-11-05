# 0002. Freeze wiki content at 2026-10-01, before the Yggdrasil service split

## Status
Accepted

## Date
2026-10-01

## Context
The Yggdrasil compatibility stack was moved out of the HRPAuth core into the separate HRPAuth-Yggdrasil-API service. The wiki pages describe the pre-split monolith. Rather than rewrite every page to track the moving code, the wiki content was frozen at its then-current state, and the split is recorded on the pages as attribution annotations.

## Decision
Freeze the wiki content at 2026-10-01. Pages are not rewritten to follow the codebase; the only edits accepted on frozen pages are annotations recording where each capability now lives (HRPAuth-Yggdrasil-API / HASkinLib / HASkinProxy) and pointers at successor documentation venues, without rewriting structure, language, or remaining content. The freeze itself is stated on the HRPAuth index page.

## Consequences
- The wiki remains a coherent snapshot of the pre-split system, useful as historical reference.
- Costs and limitations: pages describe endpoints, config keys (`yggdrasil.*`), and module layouts that no longer exist in the HRPAuth core; a reader who misses the annotation boxes will get stale facts. Keeping the pages accurate would require continuous rewrites across two repositories; that cost is explicitly declined.
- Because content does not track the code, this wiki cannot serve as the authority for current behavior; authority is HA-Contract (see 0004) and live documentation is the successor site (see 0003).
- The freeze is a social convention stated in one line on the HRPAuth index page, not enforced by any tooling.

## Evidence
- HRPAuth/index.md (field: 本 Wiki 内容冻结于) — "本 Wiki 内容冻结于 2026-10 拆分前后，涉及 Yggdrasil 的页面已补充归属标注" (freeze statement in the content itself).
- HRPAuth/configuration.md (field: 不再属于核心配置) — the configuration page states that the `yggdrasil` and `keygen` blocks no longer belong to the core config, and that its remaining sections describe the pre-split structure.
- /home/lnb/Desktop/HA/HRPAuth-Yggdrasil-API — the standalone Yggdrasil service exists as a sibling repository, and the HRPAuth core's Go sources contain no Yggdrasil protocol routes (`authserver/authenticate` absent).
