import Foundation

/// Why `InventoryStore.perform(_:)` or `undo(_:)` did not change anything.
///
/// While writes wait for the server, a mutation the server did not apply is
/// thrown as one of these instead of being kept as an open repair: the cases
/// mirror the non-applied outcomes ADR-002's wire contract declares, so a
/// screen can say which field lost and to whom without reading a wire shape.
public enum InventoryCommandError: Error, Hashable, Sendable {
    /// The field was changed elsewhere to a different value since this
    /// phone's copy (D8). `mine` and `theirs` are display text.
    case fieldConflict(
        field: String, mine: String, theirs: String, source: InventorySyncSource, at: Date,
        currentRevision: Int)
    /// The code is already on another record (D7), with the next free one.
    case codeCollision(heldById: String, heldByName: String, suggestedCode: String)
    /// The record was deleted elsewhere.
    case deletedElsewhere(source: InventorySyncSource, at: Date)
    /// The server refused the change outright.
    case rejected(reason: InventoryRejectedReason, message: String)
    /// The receipt names no change this store can revert: it wrote no event
    /// (the value was already what it asked for), or it was not made through
    /// this store.
    case nothingToUndo
    /// No open repair has this id.
    case repairNotFound(String)
}
