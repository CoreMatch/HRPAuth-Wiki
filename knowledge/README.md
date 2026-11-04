# Knowledge Base

This knowledge base is a memo the project writes to itself. It is self-hosted and maintained inside this repository (`CoreMatch/HRPAuth-Wiki`, `knowledge/` directory). It records internal decisions and history; it does not define and does not override external behavior. External behavior is defined exclusively by HA-Contract (https://github.com/SamuelCheston/HA-Contract). If any entry here conflicts with HA-Contract, the entry is wrong: fix the entry, never the contract.

## Entries

| ID | Title | Status | Summary |
| --- | --- | --- | --- |
| [0001](./0001-plain-markdown-content-repo.md) | Keep the wiki a hand-maintained, plain-Markdown content repository | Accepted | The repo is raw Markdown files with no site generator, organized per project (HRPAuth, HASkinProxy, WinnerProxy). |
| [0002](./0002-content-frozen-before-service-split.md) | Freeze wiki content at 2026-10-01, before the Yggdrasil service split | Accepted | The last substantive content commit is 2026-10-01; only attribution annotations were added afterwards (2026-11-04). |
| [0003](./0003-superseded-by-samuelwiki-site.md) | This wiki is superseded by the SamuelWiki site (wiki.mcnb.dev) | Superseded | Per the author this wiki is outdated and no longer maintained; current documentation lives on the wiki site. |
| [0004](./0004-ha-contract-defines-external-behavior.md) | External behavior is defined by HA-Contract, not by this wiki | Accepted | This wiki records internal history; on any conflict with HA-Contract, fix the wiki side. |

## Maintenance

- New entries go in `knowledge/NNNN-<slug>.md` with the next unused ID (IDs start at 0001 and are never reused). Keep the fixed structure: `Status`, `Date`, `Context`, `Decision`, `Consequences`, `Evidence`.
- Every claim must be verified against actual files or git history before it is written down. Anything that cannot be verified must be marked `not verified` instead of guessed.
- `Date` is taken from the cited commit(s); write `not verified` when no commit pins the decision.
- The wiki pages themselves are frozen (see [0002](./0002-content-frozen-before-service-split.md)) and this wiki is no longer maintained as a documentation venue (see [0003](./0003-superseded-by-samuelwiki-site.md)). Do not rewrite frozen pages to chase the codebase; record new facts as knowledge entries or in the successor venues.
- This format mirrors the internal knowledge base kept in HA-Contract itself.
