# 0004. External behavior is defined by HA-Contract, not by this wiki

## Status
Accepted

## Date
2026-11-04 (first recorded statement inside this repository, commit d29a5f615eae190992b6129d29dd5fbd50fa1b35; whether the decision predates that commit is not verified)

## Context
This wiki describes HTTP endpoints, token flows, and configuration of the HRPAuth ecosystem, and after the 2026-10 service split (see 0002) many of those facts drifted or became attribution questions. Two repositories describing behavior can disagree; exactly one of them must win. The wiki pages themselves name HA-Contract as the interface authority, and the project's canonical URL for the contract repository is https://github.com/SamuelCheston/HA-Contract.

## Decision
This wiki (including this knowledge base) records internal decisions and history only. It does not define and does not override external behavior. External behavior is defined exclusively by HA-Contract (https://github.com/SamuelCheston/HA-Contract). If any wiki page or knowledge entry conflicts with HA-Contract, fix the wiki side; never change the contract to match this repository.

## Consequences
- Readers can use these pages for background and history, but any integration work must be checked against HA-Contract first.
- Costs and limitations: the API tables here may lag behind the contract indefinitely (they are frozen, see 0002), so this repository can silently disagree with current behavior; resolving a conflict requires manual comparison, and this knowledge base inherits the same subordinate status — its entries can never justify a behavior change.
- Keeping the contract authoritative also means contract work and wiki work stay separated; a change in one never obligates a change in the other except to fix a recorded error on the wiki side.

## Evidence
- HRPAuth/index.md (field: 接口权威以) — "接口权威以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 的契约为准" (interface authority defers to the HA-Contract contract).
- HRPAuth/api-overview.md (field: 2026-10 拆分说明) — post-split note stating moved/removed endpoints and "接口权威以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 的 OpenAPI 契约为准".
- commit d29a5f615eae190992b6129d29dd5fbd50fa1b35 — docs: update stale facts after the 2026-10 service split — dated 2026-11-04; introduces both HA-Contract authority statements above (verified via diff; they are absent from the parent commit).
- /home/lnb/Desktop/HA/HA-Contract `git remote -v` — origin is https://github.com/SamuelCheston/HA-Contract.git, matching the canonical URL used by this knowledge base.
- /home/lnb/Desktop/HA/HA-Contract commit ace38e1e98d3001b52b33c52e1d0c52d58e5255a — docs: add knowledge/ — internal ADR-style knowledge base — dated 2026-11-04; HA-Contract keeps its own ADR knowledge base, which this directory mirrors.
- Discrepancy flagged for author confirmation: the in-repo links point to https://github.com/CoreMatch/HA-Contract, while the canonical project URL and the local checkout's remote are https://github.com/SamuelCheston/HA-Contract. Which organization path is authoritative for the contract was not resolved from local evidence.
