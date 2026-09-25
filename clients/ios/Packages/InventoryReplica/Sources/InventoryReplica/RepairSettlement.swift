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
        /// The catalogue revision the change is sent against, when it moves.
        var catalogueRevision: Int?
        /// Whether the reducer judges the change before it is sent again. A
        /// change moved onto a newer catalogue is judged by
        /// ``CatalogueRebase`` instead: the reducer only accepts a protocol-2
        /// edit at the revision its item row already carries.
        var checkedByReducer = true
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
        if let reissue = try reissue(for: choice, repair, entry, in: db) {
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

    /// What `choice` sends in place of the change, or nil when it lets the
    /// change go.
    private static func reissue(
        for choice: InventoryRepairChoice, _ repair: StoredRepair, _ entry: LogEntry,
        in db: Database
    ) throws -> Reissue? {
        switch choice {
        case .keepMine(let code) where repair.canKeepMine:
            return try plan(repair, entry, code: code, in: db)
        case .replaceMine(let command):
            guard repair.kind == .catalogueChanged else {
                throw InventoryCommandError.rejected(
                    reason: .invalid, message: "only a catalogue repair takes an edited change")
            }
            var edited = entry
            edited.command = .command(command)
            edited.catalogueRevision = command.protocol2CatalogueRevision
            return try rebased(edited, in: db)
        case .keepMine, .discardMine:
            return nil
        }
    }

    private static func plan(
        _ repair: StoredRepair, _ entry: LogEntry, code: String?, in db: Database
    ) throws -> Reissue {
        if repair.kind == .catalogueChanged { return try rebased(entry, in: db) }
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

    /// The change moved onto the replica's catalogue revision, or the
    /// reason it still does not fit, thrown so nothing changes.
    private static func rebased(_ entry: LogEntry, in db: Database) throws -> Reissue {
        guard let active = try SyncMeta.read(db).catalogueRevision else {
            throw InventoryCommandError.rejected(
                reason: .catalogueUpdateRequired,
                message: "no catalogue is on this phone yet; refresh and try again")
        }
        let known =
            try RepairRows.openRepair(id: entry.mutationId, in: db)?.payload.outcome
            .catalogueChanges ?? []
        switch try CatalogueRebase.rebase(entry, onto: active, known: known, in: db) {
        case .incompatible(let changes):
            throw InventoryCommandError.rejected(
                reason: .catalogueRepairRequired, message: changes.summary)
        case .rebased(let command, let revision):
            if case .command(let inventoryCommand) = command,
                let stale = try StaleReferenceRetryCheck.stillStale(
                    inventoryCommand, onto: revision ?? active, in: db)
            {
                throw InventoryCommandError.rejected(
                    reason: stale.rejectedReason, message: stale.retryRefusalMessage)
            }
            return Reissue(
                command: command, baseRevision: entry.baseRevision, baseRevisionFloor: nil,
                restoreFirst: false, resolution: .rebased, code: nil,
                catalogueRevision: revision, checkedByReducer: false)
        }
    }

    /// The collided change sent again wearing `code`: a `setItemCode`, or a
    /// create that carried its code and so was refused whole (POPS-4063).
    private static func relabel(_ entry: LogEntry, code: String) throws -> Reissue {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, case .command(let command) = entry.command,
            let relabelled = command.wearing(trimmed)
        else {
            throw InventoryCommandError.rejected(
                reason: .invalid, message: "a new code is required")
        }
        return Reissue(
            command: .command(relabelled),
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
        if reissue.checkedByReducer {
            try validate([restore?.command, reissue.command].compactMap(\.self), on: entry, in: db)
        }
        let newId = mint()
        try MutationLogRows.rename(entry.mutationId, to: newId, in: db)
        var sent = entry.requeued(as: newId, command: reissue.command)
        sent.baseRevision = reissue.baseRevision
        sent.catalogueRevision = reissue.catalogueRevision ?? entry.catalogueRevision
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

extension InventoryCommand {
    /// The code this change asks its item to wear, when it asks for one.
    var wornCode: String? {
        switch self {
        case .setItemCode(_, let code): code
        case .createItem(let new): new.code
        case .createProtocol2Item(let new): new.code
        default: nil
        }
    }

    /// This change asking for `code` instead, or nil when it names no code.
    func wearing(_ code: String) -> InventoryCommand? {
        switch self {
        case .setItemCode(let id, _): .setItemCode(id: id, code: code)
        case .createItem(let new): .createItem(new.wearing(code))
        case .createProtocol2Item(let new): .createProtocol2Item(new.wearing(code))
        default: nil
        }
    }
}
