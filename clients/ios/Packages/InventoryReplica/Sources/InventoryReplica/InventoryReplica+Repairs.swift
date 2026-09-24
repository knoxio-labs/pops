import AppCore
import Foundation

/// Repairs (ADR-002's sync state machine): a change the server answered
/// `conflict` or `rejected` stays in the log in that state, held with
/// everything depending on it, and opens one repair keyed by its mutation
/// id. The Sync page lists open repairs, and what was resolved, through
/// `InventoryQuery.syncLedger`.
extension InventoryReplica {
    /// Settles an open repair, in one transaction with the rebase it causes.
    ///
    /// Keeping this phone's side logs the change again under a new mutation
    /// id, in its old place in the log, because the server answers a
    /// mutation id it has seen with the outcome it stored. What depended on
    /// the old id now depends on the new one:
    /// - a field conflict is re-sent based on the conflict's
    ///   `currentRevision`;
    /// - a code collision is re-sent with `code`, or the suggested code when
    ///   it is nil;
    /// - a record deleted elsewhere is re-sent behind a new
    ///   `item.restoreDeleted`;
    /// - a failed photo's attach is sent again, behind a fresh upload of
    ///   the bytes when this phone staged them;
    /// - a change that no longer fits the catalogue, or whose reference value
    ///   the server refused (`catalogueChanged`), is moved onto the replica's
    ///   current revision and sent against it, or refused with
    ///   ``AppCore/InventoryRejectedReason/catalogueRepairRequired`` naming
    ///   what still does not fit. `replaceMine` sends Edit item's reworking
    ///   of it the same way.
    ///
    /// Letting go (`discardMine`, and either choice on a refusal the design
    /// has no repair for) drops the change, releases what depended on it,
    /// and rebases its row on the server's state. A failed photo's staged
    /// bytes are unpinned then, unless another change still attaches them.
    ///
    /// - Parameter mintMutationId: Called for the re-sent change, and first
    ///   for its Restore when there is one.
    /// - Throws: ``AppCore/InventoryCommandError/repairNotFound(_:)`` when no
    ///   open repair has this id; ``AppCore/InventoryCommandError`` when the
    ///   reducer refuses what keeping this phone's side would send (a code
    ///   another item holds, a place deleted elsewhere). Nothing changes then.
    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice,
        mintMutationId: () -> String, at time: Date
    ) throws {
        try write { db in
            try RepairSettlement.resolve(
                repairId, with: choice, mint: mintMutationId, at: time, in: db)
        }
    }
}
