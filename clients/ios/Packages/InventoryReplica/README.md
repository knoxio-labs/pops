# InventoryReplica

The phone's copy of the inventory. The Inventory screens read from here, not from the network, so what they show is whatever the last snapshot and change-feed pages delivered. The decisions behind it are Inventory ADR-002 D2, D9, D10 and D11.

It is one of the packages `ModuleBoundaryTests` allows to hold a concrete implementation of an `AppCore` seam, and the only one allowed to depend on [GRDB](https://github.com/groue/GRDB.swift), pinned `exact:` for the reason [`../BFMClient/Package.swift`](../BFMClient/Package.swift) gives. It performs no HTTP: whatever drives it fetches pages through `AppCore`'s `InventorySyncTransport` and hands them to `InventoryReplica.apply(_:)`.

The database is in memory, so a relaunch downloads again; the on-disk replica is POPS-4069.

## How a page lands

Every page is one transaction. Rows are upserted by revision: a row at or below the stored revision is ignored, which is what makes a snapshot page that raced the feed, or a page delivered twice, harmless. A tombstone is just a newer revision with `deletedAt` set. The row is kept, because an item in hand remembers where it came from and "Previous place deleted" is read off that tombstone, and every query leaves it out.

A snapshot page from a new epoch discards every stored row first: a restored server rewinds revisions and `seq`, so nothing stored compares with what it sends. A feed page from another epoch is refused outright; the answer to it is a fresh snapshot.

Items and locations each have two tables of the same shape: `*_base` is what the server last sent, and the unsuffixed table is what queries read. They hold the same rows until the mutation log replays this phone's pending changes over the base (POPS-4071).

## Reads

Every `InventoryQuery` is answered by `InventoryReplica.read(_:)`, and `observe(_:)` re-reads it after each committed write. `InventoryQuerySource`'s reads cannot throw, so a failed read is kept and rethrown by `read(_:)` rather than returned as an empty list that looks like an empty inventory.

Effective location is walked, never stored (D2). Contents of a place are every active item whose chain of containers ends there, so moving a box writes one row and everything inside follows with its own revision untouched. `placementTrail(ofItem:)` returns the walk itself, outermost container first; `InventoryQuery` has no case for it.

Search is FTS5 with the trigram tokenizer, because the approved rule is "contains", not "has a word starting with". A query shorter than three characters has no trigram, so it falls back to `LIKE` over the same columns. Results are ranked the way the design playground's `InventorySearchRanking` does: name prefix, then name contains, then any other field. A type's label is searchable, so storing a new catalogue re-indexes every row.

The sync ledger is always empty: there is no mutation log or repair table yet (POPS-4071, POPS-4073).
