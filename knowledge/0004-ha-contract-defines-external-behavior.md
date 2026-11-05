# 0004. External behavior is defined by HA-Contract, not by this wiki

## Status
Accepted

## Date
2026-11-04

## Context
This wiki describes HTTP endpoints, token flows, and configuration of the HRPAuth ecosystem; the frozen pages and the codebase can disagree (see 0002). Two repositories describing behavior can disagree; exactly one of them must win. The wiki pages themselves name HA-Contract as the interface authority, and the contract repository is https://github.com/CoreMatch/HA-Contract.

## Decision
This wiki (including this knowledge base) records internal decisions only. It does not define and does not override external behavior. External behavior is defined exclusively by HA-Contract (https://github.com/CoreMatch/HA-Contract). If any wiki page or knowledge entry conflicts with HA-Contract, fix the wiki side; never change the contract to match this repository.

## Consequences
- Readers can use these pages for background, but any integration work must be checked against HA-Contract first.
- Costs and limitations: the API tables here may lag behind the contract indefinitely (they are frozen, see 0002), so this repository can silently disagree with current behavior; resolving a conflict requires manual comparison, and this knowledge base inherits the same subordinate status — its entries can never justify a behavior change.
- Keeping the contract authoritative also means contract work and wiki work stay separated; a change in one never obligates a change in the other except to fix a recorded error on the wiki side.

## Evidence
- HRPAuth/index.md (field: 接口权威以) — "接口权威以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 的契约为准" (interface authority defers to the HA-Contract contract).
- HRPAuth/api-overview.md (field: 2026-10 拆分说明) — post-split note stating moved/removed endpoints and "接口权威以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 的 OpenAPI 契约为准".
- /home/lnb/Desktop/HA/HA-Contract (git remote origin) — https://github.com/CoreMatch/HA-Contract.git, matching the URL the wiki pages use.
- /home/lnb/Desktop/HA/HA-Contract knowledge/ — HA-Contract keeps its own ADR-style knowledge base, which this directory mirrors.
