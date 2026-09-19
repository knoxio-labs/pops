import AppCore
import Foundation
import GRDB

/// The Sync page's "waiting" list, read off the mutation log.
internal enum MutationLogLedger {
    /// Every pending mutation, oldest first. An Undo whose change the server
    /// has not applied yet has no command to show and is left out until it
    /// does.
    static func waiting(in db: Database) throws -> [InventoryQueuedMutation] {
        try MutationLogRows.entries(in: [.queued, .sending, .deferred], db).compactMap { entry in
            guard let command = try MutationLogWrites.command(sending: entry, in: db),
                let kind = InventoryEntityKind(storageValue: entry.entity.kind)
            else { return nil }
            return InventoryQueuedMutation(
                receipt: InventoryReceipt(
                    mutationId: entry.mutationId, entityKind: kind, entityId: entry.entity.id),
                command: command,
                enqueuedAt: Date(timeIntervalSinceReferenceDate: entry.createdAt))
        }
    }
}
