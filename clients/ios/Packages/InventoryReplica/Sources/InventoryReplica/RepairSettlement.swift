import AppCore
import Foundation
import GRDB

/// Opening and settling repairs, inside the caller's transaction (ADR-002's
/// sync state machine: conflict to saved through a new mutation, conflict
/// or rejected to discarded).
internal enum RepairSettlement {
    /// What keeping this phone's side sends: the change again under a new
    /// id, behind a Restore when the record was deleted elsewhere.
    private struct Reissue {
        let command: LoggedCommand
        let baseRevision: Int?
        let baseRevisionFloor: Int?
        let restoreFirst: Bool
        let resolution: RepairResolution
        let code: String?
    }

    /// Opens the repair a conflicted or rejected outcome calls for, or
    /// records a converged one as resolved.
    static func record(
        _ outcome: StoredOutcome, for entry: LogEntry, at time: Double, in db: Database
    )
        throws
    {
        if case .applied(_, _, let converged) = outcome {
            guard converged else { return }
            try RepairRows.recordResolved(
                InventoryResolvedEntry(
                    id: entry.mutationId, entityId: entry.entity.id,
                    outcome: RepairResolution.convergedLine(for: entry.command),
                    resolvedAt: Date(timeIntervalSinceReferenceDate: time)), in: db)
        } else {
            try RepairRows.open(for: entry, outcome: outcome, at: time, in: db)
        }
    }

    static func resolve(
        _ id: String, with choice: InventoryRepairChoice, mint: () -> String, at time: Date,
        in db: Database
    ) throws {
        guard let repair = try RepairRows.openRepair(id: id, in: db),
            let entry = try MutationLogRows.entry(mutationId: id, in: db)
        else { throw InventoryCommandError.repairNotFound(id) }
        let line: String
        if case .keepMine(let code) = choice, repair.canKeepMine {
            let reissue = try plan(repair, entry, code: code)
            let newId = try send(reissue, of: entry, as: mint, at: time, in: db)
            if repair.kind == .photoFailed, let sha256 = entry.command.attachedPhoto {
                try MediaRows.restage(sha256, in: db)
            }
            try RepairRows.close(
                id, resolution: reissue.resolution, reissuedAs: newId,
                baseRevisionFloor: reissue.baseRevisionFloor, at: storedDate(time), in: db)
            line = reissue.resolution.line(code: reissue.code)
        } else {
            let resolution = RepairResolution.lettingGo(repair.kind)
            try MutationLogWrites.remove([entry], in: db)
            if let sha256 = entry.command.attachedPhoto {
                try MediaRows.releaseUnlessAwaited(sha256, in: db)
            }
            try RepairRows.close(id, resolution: resolution, at: storedDate(time), in: db)
            line = resolution.line()
        }
        try RepairRows.recordResolved(
            InventoryResolvedEntry(
                id: id, entityId: entry.entity.id, outcome: line, resolvedAt: time), in: db)
        try MutationLogReplay.rebase(resetting: [entry.entity], in: db)
    }

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

    private static func plan(_ repair: StoredRepair, _ entry: LogEntry, code: String?) throws
        -> Reissue
    {
        switch repair.payload.outcome {
        case .conflictField(_, _, _, _, _, let currentRevision):
            return Reissue(
                command: entry.command, baseRevision: currentRevision,
                baseRevisionFloor: currentRevision, restoreFirst: false, resolution: .keptMine,
                code: nil)
        case .conflictCodeCollision(_, _, let suggestedCode):
            return try relabel(entry, code: code ?? suggestedCode)
        case .conflictDeleted:
            guard entry.entity.kind == "item" else {
                throw InventoryCommandError.rejected(
                    reason: .invalid, message: "a place deleted elsewhere cannot be restored")
            }
            return Reissue(
                command: entry.command, baseRevision: entry.baseRevision, baseRevisionFloor: nil,
                restoreFirst: true, resolution: .restored, code: nil)
        case .rejected, .applied, .deferred:
            return Reissue(
                command: entry.command, baseRevision: entry.baseRevision, baseRevisionFloor: nil,
                restoreFirst: false, resolution: .retried, code: nil)
        }
    }

    private static func relabel(_ entry: LogEntry, code: String) throws -> Reissue {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, case .command(.setItemCode(let id, _)) = entry.command else {
            throw InventoryCommandError.rejected(
                reason: .invalid, message: "a new code is required")
        }
        return Reissue(
            command: .command(.setItemCode(id: id, code: trimmed)),
            baseRevision: entry.baseRevision, baseRevisionFloor: nil, restoreFirst: false,
            resolution: .relabelled, code: trimmed)
    }

    /// Logs the change again under a new id in its old place in the log,
    /// behind a new Restore when asked, after checking the reducer takes
    /// both. Returns the change's new id.
    private static func send(
        _ reissue: Reissue, of entry: LogEntry, as mint: () -> String, at time: Date,
        in db: Database
    ) throws -> String {
        let restore = reissue.restoreFirst ? restoreEntry(for: entry, id: mint(), at: time) : nil
        try validate([restore?.command, reissue.command].compactMap(\.self), on: entry, in: db)
        let newId = mint()
        try MutationLogRows.rename(entry.mutationId, to: newId, in: db)
        var sent = entry.requeued(as: newId, command: reissue.command)
        sent.baseRevision = reissue.baseRevision
        sent.dependsOn = (entry.dependsOn + [restore?.mutationId].compactMap(\.self)).sorted()
        try MutationLogRows.update(sent, in: db)
        if let restore { try MutationLogRows.insert(restore, in: db) }
        return newId
    }

    /// Refuses, with the reducer's reason, what the server would refuse too.
    private static func validate(_ commands: [LoggedCommand], on entry: LogEntry, in db: Database)
        throws
    {
        try db.inSavepoint {
            for command in commands {
                _ = try LocalReducer.apply(
                    command, primary: entry.entity,
                    at: Date(timeIntervalSinceReferenceDate: entry.createdAt), in: db)
            }
            return .rollback
        }
    }

    private static func isAlreadyOnServer(_ entry: LogEntry, in db: Database) throws -> Bool {
        guard case .command = entry.command else { return false }
        var unchanged = false
        let catalogue = try SyncMeta.read(db).storedCatalogue()
        try db.inSavepoint {
            try MutationLogReplay.resetView(entry.entity, catalogue: catalogue, in: db)
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

    private static func restoreEntry(for entry: LogEntry, id: String, at time: Date) -> LogEntry {
        LogEntry(
            localSeq: nil, mutationId: id, entity: entry.entity,
            command: .command(.restoreDeletedItem(id: entry.entity.id)), dependsOn: [],
            baseRevision: nil, catalogueRevision: entry.catalogueRevision, state: .queued,
            outcome: nil, settlesAtSeq: nil, touched: [],
            change: nil, attempts: 0, createdAt: storedDate(time), lastAttemptAt: nil)
    }
}

extension LogEntry {
    /// This entry as a fresh, never-attempted change under `mutationId`,
    /// in the same place in the log and made at the same time.
    func requeued(as mutationId: String, command: LoggedCommand) -> LogEntry {
        LogEntry(
            localSeq: localSeq, mutationId: mutationId, entity: entity, command: command,
            dependsOn: dependsOn, baseRevision: baseRevision,
            catalogueRevision: catalogueRevision, state: .queued, outcome: nil,
            settlesAtSeq: nil, touched: [], change: nil, attempts: 0, createdAt: createdAt,
            lastAttemptAt: nil)
    }
}
