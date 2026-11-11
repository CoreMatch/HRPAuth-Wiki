# Knowledge Base

This knowledge base is a memo the project writes to itself. It is self-hosted and maintained inside this repository (`CoreMatch/HRPAuth-Wiki`, `knowledge/` directory). It records internal decisions; it does not define and does not override external behavior. External behavior is defined exclusively by HA-Contract (https://github.com/CoreMatch/HA-Contract). If any entry here conflicts with HA-Contract, the entry is wrong: fix the entry, never the contract.

## Entries

| ID | Title | Status | Summary |
| --- | --- | --- | --- |
| [0001](./0001-plain-markdown-content-repo.md) | Keep the wiki a hand-maintained, plain-Markdown content repository | Superseded by 0006 | The repo was raw Markdown files with no site generator, organized per project (HRPAuth, HASkinProxy, WinnerProxy). |
| [0002](./0002-content-frozen-before-service-split.md) | Freeze wiki content at 2026-10-01, before the Yggdrasil service split | Accepted | The wiki pages are frozen at the pre-split state and carry attribution annotations pointing at the post-split services. |
| [0003](./0003-superseded-by-samuelwiki-site.md) | This wiki is superseded by the SamuelWiki site (wiki.mcnb.dev) | Reversed by 0005 | Per the author this wiki was outdated and no longer maintained; the supersession was reversed when SamuelWiki was retired (see 0005). |
| [0004](./0004-ha-contract-defines-external-behavior.md) | External behavior is defined by HA-Contract, not by this wiki | Accepted | This wiki records internal decisions; on any conflict with HA-Contract, fix the wiki side. |
| [0005](./0005-samuelwiki-retired-venue-restored.md) | SamuelWiki retired; this wiki is the documentation venue again | Accepted | The author retired SamuelWiki; current-state pages for the game stack return to this repository as new per-project directories, frozen pages stay frozen. |
| [0006](./0006-rendering-layer-over-markdown.md) | Render the wiki with VitePress; Markdown stays the single content source | Accepted | Supersedes 0001: the same Markdown files are rendered into a Chinese single-language site (default theme, no runtime CDN); raw files stay the only source. |
| [0007](./0007-samuelwiki-detached-scaffold-removed.md) | SamuelWiki fully detached from HA; remaining scaffold removed | Accepted | The author confirms SamuelWiki is unrelated to HA; the docs/ scaffold and the docs/** srcExclude are removed; wiki.mcnb.dev serves this site. |

## Maintenance

- New entries go in `knowledge/NNNN-<slug>.md` with the next unused ID (IDs start at 0001 and are never reused). Keep the fixed structure: `Status`, `Context`, `Decision`, `Consequences`, `Evidence`.
- Entries record the current state only: what the project is now, and why it is designed that way. Do not write how things used to be; descriptions of removed code, deprecated fields, or old behavior are deleted, not kept. The one exception is past behavior that explains a change of design intent — why the current state differs from what came before.
- Every claim must be verified against actual files before it is written down. Anything that cannot be verified must be marked `not verified` instead of guessed.
- The frozen wiki pages ([0002](./0002-content-frozen-before-service-split.md)) are not rewritten to chase the codebase. Per [0005](./0005-samuelwiki-retired-venue-restored.md) this wiki is the documentation venue again: new current-state content goes into new per-project directories (or knowledge entries for decisions), never into the frozen directories.
- This format mirrors the internal knowledge base kept in HA-Contract itself.
