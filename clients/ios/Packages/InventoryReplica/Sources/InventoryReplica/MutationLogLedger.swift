import AppCore
import Foundation
import GRDB

/// The Sync page's "waiting" list, read off the mutation log.
internal enum MutationLogLedger {
    /// Every pending mutation, oldest first, with progress `0` while it is
    /// in the drain's batch (a mutation has no bytes to count; "Syncing" is
    /// what the row mark needs), and why it is held when it is:
    /// - waiting for new fields, or for an app update, as the log recorded
    ///   when the server asked for a newer catalogue (``CatalogueHold``);
    /// - behind a repair, when a change it depends on, directly or through
    ///   another held change, waits on one;
    /// - stalled, when its row cannot be read back: it is listed with no
    ///   command rather than failing the whole ledger.
    ///
    /// An Undo whose change the server has not applied yet has no command to
    /// show and is left out until it does.
    static func waiting(in db: Database) throws -> [InventoryQueuedMutation] {
        var behindRepair = try MutationLogRows.awaitingRepair(in: db)
        let rows = try MutationLogRows.ledgerRows(in: [.queued, .sending, .deferred], db)
        return try rows.compactMap { row in
            switch row {
            case .readable(let entry):
                let hold = hold(of: entry, behind: behindRepair)
                if hold == .behindRepair { behindRepair.insert(entry.mutationId) }
                return try queued(entry, hold: hold, in: db)
            case .unreadable(let mutationId, let entity, let createdAt):
                guard let kind = InventoryEntityKind(storageValue: entity.kind) else { return nil }
                return InventoryQueuedMutation(
                    receipt: InventoryReceipt(
                        mutationId: mutationId, entityKind: kind, entityId: entity.id),
                    command: nil, enqueuedAt: Date(timeIntervalSinceReferenceDate: createdAt),
                    hold: .stalled)
            }
        }
    }

    private static func hold(of entry: LogEntry, behind held: Set<String>) -> InventoryQueueHold? {
        switch entry.catalogueHold {
        case .newFields: return .waitingForFields
        case .appUpdate: return .needsAppUpdate
        case nil: return entry.dependsOn.contains(where: held.contains) ? .behindRepair : nil
        }
    }

    private static func queued(
        _ entry: LogEntry, hold: InventoryQueueHold?, in db: Database
    ) throws -> InventoryQueuedMutation? {
        guard let command = try MutationLogWrites.command(sending: entry, in: db),
            let kind = InventoryEntityKind(storageValue: entry.entity.kind)
        else { return nil }
        return InventoryQueuedMutation(
            receipt: InventoryReceipt(
                mutationId: entry.mutationId, entityKind: kind, entityId: entry.entity.id),
            command: command,
            enqueuedAt: Date(timeIntervalSinceReferenceDate: entry.createdAt),
            progress: entry.state == .sending ? 0 : nil, hold: hold)
    }
}
