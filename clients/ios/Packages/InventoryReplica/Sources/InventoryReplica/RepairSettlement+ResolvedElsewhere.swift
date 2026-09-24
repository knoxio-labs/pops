import AppCore
import Foundation
import GRDB

extension RepairSettlement {
    /// Closes every open repair whose change the server's state already
    /// carries, as the change feed now shows it: applying the change to the
    /// server's row would alter nothing. Its log row goes, releasing what
    /// depended on it.
    static func settleResolvedElsewhere(at time: Date, in db: Database) throws {
        for repair in try RepairRows.openRepairs(in: db) {
            guard let entry = try MutationLogRows.entry(mutationId: repair.mutationId, in: db),
                try isAlreadyOnServer(entry, in: db)
            else { continue }
            try MutationLogWrites.remove([entry], in: db)
            try RepairRows.close(
                repair.mutationId, resolution: .resolvedElsewhere, at: storedDate(time), in: db)
            try RepairRows.recordResolved(
                InventoryResolvedEntry(
                    id: repair.mutationId, entityId: entry.entity.id,
                    outcome: RepairResolution.resolvedElsewhere.line(), resolvedAt: time), in: db)
        }
    }

    private static func isAlreadyOnServer(_ entry: LogEntry, in db: Database) throws -> Bool {
        guard case .command = entry.command else { return false }
        var unchanged = false
        // This savepoint always rolls back, so the reindex `resetView` performs as part of
        // materializing the view row never reaches disk: there is nothing for a catalogue to
        // improve here, and reading one just to discard it invites the protocol-1-only bug this
        // call site once had (POPS-4433).
        try db.inSavepoint {
            try MutationLogReplay.resetView(
                entry.entity, catalogue: SearchCatalogue(types: nil), in: db)
            do {
                let application = try LocalReducer.apply(
                    entry.command, primary: entry.entity,
                    at: Date(timeIntervalSinceReferenceDate: entry.createdAt), in: db)
                unchanged = application.events.isEmpty
            } catch is InventoryCommandError {
                unchanged = false
            }
            return .rollback
        }
        return unchanged
    }
}
