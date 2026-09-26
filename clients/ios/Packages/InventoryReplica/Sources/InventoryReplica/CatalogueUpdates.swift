import AppCore
import GRDB

/// What the log does with a change the server answered
/// `catalogue_update_required` for (POPS-4405), inside the caller's
/// transaction.
///
/// Such a change is not refused for good: its authored revision is one the
/// server cannot judge it by. It is logged again under a new id (the server
/// answers an id it has seen with the outcome it stored), stays queued and
/// replayed, but is held back from the drain until the replica holds a
/// newer catalogue, with why it is held (``CatalogueHold``) and what the
/// server named. Then it is moved onto that revision (``CatalogueRebase``)
/// and sent, or, when it names a field or type the newer revision archived
/// or replaced, it opens the `catalogueChanged` repair.
///
/// A change the server already moved and still could not apply
/// (`catalogue_repair_required`) opens that repair directly, unless the
/// server named a replacement for what is in the way: that change is held
/// the same way, so the move can try the replacement once this phone has
/// its definition.
internal enum CatalogueUpdates {
    /// Holds `entry` for a newer catalogue when `outcome` asks for one.
    ///
    /// - Returns: False, touching nothing, for any other outcome.
    static func holdForUpdate(
        _ outcome: InventoryMutationOutcome, of entry: LogEntry, mint: () -> String,
        in db: Database
    ) throws -> Bool {
        guard case .rejected(let reason, _, let changes, _) = outcome,
            reason == .catalogueUpdateRequired
                || (reason == .catalogueRepairRequired && changes.contains(where: \.isReplacement))
        else { return false }
        let newId = mint()
        try MutationLogRows.rename(entry.mutationId, to: newId, in: db)
        var held = entry.requeued(as: newId, command: entry.command)
        held.awaitingCatalogueAfter = try heldAfter(entry, in: db)
        held.catalogueHold =
            changes.contains { $0.change == .needsNewerApp } ? .appUpdate : .newFields
        held.catalogueChanges = changes.map(StoredCatalogueChange.init)
        try MutationLogRows.update(held, in: db)
        return true
    }

    /// The revision a refused change waits to be moved past: the one it was
    /// sent with, or, for a change sent with none, the one the replica held
    /// when the server refused it (0 before any), so only a catalogue this
    /// phone has not seen yet releases it.
    private static func heldAfter(_ entry: LogEntry, in db: Database) throws -> Int {
        if let sent = entry.catalogueRevision { return sent }
        return try SyncMeta.read(db).catalogueRevision ?? 0
    }

    static func hasHeld(in db: Database) throws -> Bool {
        try !held(in: db).isEmpty
    }

    /// Records that what is held needs a newer app: the refresh that would
    /// bring its catalogue found this build too old for it.
    static func markNeedingAppUpdate(in db: Database) throws {
        for var entry in try held(in: db) where entry.catalogueHold != .appUpdate {
            entry.catalogueHold = .appUpdate
            try MutationLogRows.update(entry, in: db)
        }
    }

    /// Moves every held change onto the replica's catalogue revision, or
    /// opens its repair: when that revision is no newer than the one the
    /// server turned down, or the change no longer fits it. Call it after a
    /// refresh that reached the server, so "no newer revision" is the
    /// server's answer and not a stale replica's.
    ///
    /// - Returns: The rows the moved and refused changes touch, for the
    ///   rebase to reset.
    static func moveHeld(at time: Double, in db: Database) throws -> Set<EntityRef> {
        let active = try SyncMeta.read(db).catalogueRevision
        var touched: Set<EntityRef> = []
        for var entry in try held(in: db) {
            touched.formUnion(entry.touched.union([entry.entity]))
            let named = entry.catalogueChanges.map(\.value)
            let refused = try entry.awaitingCatalogueAfter ?? heldAfter(entry, in: db)
            guard let active, active > refused else {
                let unchanged = InventoryCatalogueChange(
                    definition: .revision, id: String(refused), change: .notInRevision,
                    revision: refused)
                try openRepair(
                    for: &entry, changes: named.isEmpty ? [unchanged] : named, at: time, in: db)
                continue
            }
            switch try CatalogueRebase.rebase(entry, onto: active, known: named, in: db) {
            case .rebased(let command, let revision):
                entry.command = command
                entry.catalogueRevision = revision
                release(&entry)
                try MutationLogRows.update(entry, in: db)
            case .incompatible(let changes):
                try openRepair(for: &entry, changes: changes, at: time, in: db)
            }
        }
        return touched
    }

    private static func openRepair(
        for entry: inout LogEntry, changes: [InventoryCatalogueChange], at time: Double,
        in db: Database
    ) throws {
        let outcome = StoredOutcome.rejected(
            reason: InventoryRejectedReason.catalogueRepairRequired.storageValue,
            message: changes.summary, catalogueChanges: changes.map(StoredCatalogueChange.init),
            incomingReference: nil)
        entry.outcome = outcome
        entry.state = outcome.state
        release(&entry)
        try MutationLogRows.update(entry, in: db)
        try RepairSettlement.record(outcome, for: entry, at: time, in: db)
    }

    private static func release(_ entry: inout LogEntry) {
        entry.awaitingCatalogueAfter = nil
        entry.catalogueHold = nil
        entry.catalogueChanges = []
    }

    private static func held(in db: Database) throws -> [LogEntry] {
        try MutationLogRows.entries(in: [.queued], db).filter { $0.awaitingCatalogueAfter != nil }
    }
}

extension InventoryCatalogueChange {
    /// A definition the server named as replaced by another one.
    var isReplacement: Bool { change == .replaced && replacementId != nil }
}

extension InventoryReplica {
    /// Whether any change waits for a newer catalogue before it can be sent.
    func hasChangesAwaitingCatalogue() throws -> Bool {
        try database.read { try CatalogueUpdates.hasHeld(in: $0) }
    }

    /// Records that the changes waiting for a newer catalogue need a newer
    /// app to read it.
    func markChangesAwaitingCatalogueNeedAppUpdate() throws {
        try write { try CatalogueUpdates.markNeedingAppUpdate(in: $0) }
    }

    /// ``CatalogueUpdates/moveHeld(at:in:)`` and the rebase it causes, in
    /// one transaction.
    func moveChangesAwaitingCatalogue() throws {
        let time = storedDate(now())
        try write { db in
            let touched = try CatalogueUpdates.moveHeld(at: time, in: db)
            guard !touched.isEmpty else { return }
            try MutationLogReplay.rebase(resetting: touched, in: db)
        }
    }
}
