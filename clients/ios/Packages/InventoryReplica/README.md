# InventoryReplica

The phone's copy of the inventory. The Inventory screens read from here, not from the network, so what they show is whatever the last snapshot and change-feed pages delivered. The decisions behind it are Inventory ADR-002 D2, D9, D10 and D11.

It is one of the packages `ModuleBoundaryTests` allows to hold a concrete implementation of an `AppCore` seam, and the only one allowed to depend on [GRDB](https://github.com/groue/GRDB.swift), pinned `exact:` for the reason [`../BFMClient/Package.swift`](../BFMClient/Package.swift) gives. It performs no HTTP: `OnlineInventoryStore` fetches pages through `AppCore`'s `InventorySyncTransport` and hands them to `InventoryReplica.apply(_:)`.

`InventoryReplica()` is in memory, for tests and previews, so a relaunch downloads again. `InventoryReplica(onDiskAt:)` (POPS-4069) is the durable one: WAL with `synchronous = FULL`, `completeUntilFirstUserAuthentication` on the database and media cache, the media cache excluded from backup, a free-space floor and `SQLITE_FULL` both raised as `InventoryStorageError.full`, and a migration that cannot run falling back to a fresh snapshot while keeping the `mutation_log` table by name.

## How a page lands

Every page is one transaction. Rows are upserted by revision: a row at or below the stored revision is ignored, which is what makes a snapshot page that raced the feed, or a page delivered twice, harmless. A tombstone is just a newer revision with `deletedAt` set. The row is kept, because an item in hand remembers where it came from and "Previous place deleted" is read off that tombstone, and every query leaves it out.

A snapshot page from a new epoch discards every stored row first: a restored server rewinds revisions and `seq`, so nothing stored compares with what it sends. A feed page from another epoch is refused outright; the answer to it is a fresh snapshot.

Items and locations each have two tables of the same shape: `*_base` is what the server last sent, and the unsuffixed table is what queries read. A page writes only the base; the rebase that follows in the same transaction resets every row the page changed, or any logged change wrote, and replays the log over it.

## The mutation log

`perform(_:mutationId:clientTime:)` applies a command to the optimistic layer through `LocalReducer` and logs it in `mutation_log`, in one transaction, and returns: the change is on disk before anything is sent. The reducer is the server's command layer (`pillars/inventory/src/domain/commands/`) redone in Swift. It refuses what the server refuses, with the same reason, and records the same revision bumps and events. `CommandVectorTests` replays every vector in `clients/ios/Contracts/command-vectors-v1.json` through it and checks the outcome, the mutation that would be sent, and the resulting rows.

- A change depends on the newest pending change that wrote any row it writes or points at, so the server never applies it first.
- Its base revision is the one its author saw. A change behind another of this phone's changes to the same row is based on the revision that one leaves, recomputed on every rebase and corrected by the applied outcome, so it never conflicts with this phone's own edit.
- A feed page changing a row under a pending change resets the row to the new base and replays the change over it. A change the reducer now refuses, because its target was deleted elsewhere for instance, stops showing but stays logged: the server's outcome decides.
- An applied change keeps showing, at the server's revision, until the feed reaches the batch's high-water `seq`. A conflicted or rejected one stops showing; its row shows the server's state until repairs exist (POPS-4073).
- `undo(_:undoMutationId:clientTime:)` cancels a change still on the device, along with what depends on it, and otherwise logs an Undo that goes out as `event.revert` once the change's outcome names its event. Undoing a create, a split or a destroy is refused, as the server refuses it.

Sending is the drain's (POPS-4072): it takes `outboundMutations(limit:)`, marks them with `markSending(_:at:)`, submits them, and hands the result to `recordOutcomes(_:)`, or to `returnToQueue(_:)` when the batch never arrived. `LocalFirstInventoryStore` is the `InventoryStore` over this: `perform` and `undo` are local, everything else is `OnlineInventoryStore`'s.

## The online store

`OnlineInventoryStore` is the `InventoryStore` the app binds while every write waits for the server. It reads from a replica and fills it through the transport; download, refresh and the catch-up after a write run one at a time.

- `download()` pages the snapshot, then follows the change feed. Each page is stored with the cursor after it, so an interrupted download resumes there rather than from the start, and `refresh()` finishes one before reading the feed.
- `perform(_:)` sends one mutation, based on the revision the replica holds, and returns only once the server has applied it. The replica is untouched until then and caught up from the feed before it returns. A conflict or a rejection is thrown as `InventoryCommandError`, so there are no repairs yet.
- `undo(_:)` sends `event.revert` for the event the change wrote, which the applied outcome's `seq` names. A change that altered nothing wrote no event and has nothing to undo.
- A `409 resync_required`, or a feed page from another epoch, discards every server row before a fresh snapshot. Upserting by revision alone would keep a row the server no longer has, and ignore one whose revision a restored server rewound, even within one epoch. A resync that is refused again is thrown rather than retried.

The replica derives empty, downloading, current and stale from what it stores. The store adds what only a network caller knows: refreshing while the feed is read, offline when the server could not be reached, and blocked on a `401` or a `426`. Reaching the server again clears offline and blocked.

## Reads

Every `InventoryQuery` is answered by `InventoryReplica.read(_:)`, and `observe(_:)` re-reads it after each committed write. `InventoryQuerySource`'s reads cannot throw, so a failed read is kept and rethrown by `read(_:)` rather than returned as an empty list that looks like an empty inventory.

Effective location is walked, never stored (D2). Contents of a place are every active item whose chain of containers ends there, so moving a box writes one row and everything inside follows with its own revision untouched. `placementTrail(ofItem:)` returns the walk itself, outermost container first; `InventoryQuery` has no case for it.

Search is FTS5 with the trigram tokenizer, because the approved rule is "contains", not "has a word starting with". A query shorter than three characters has no trigram, so it falls back to `LIKE` over the same columns. Results are ranked the way the design playground's `InventorySearchRanking` does: name prefix, then name contains, then any other field. A type's label is searchable, so storing a new catalogue re-indexes every row.

The sync ledger lists what waits for the server, in log order. It has no repairs yet (POPS-4073).
