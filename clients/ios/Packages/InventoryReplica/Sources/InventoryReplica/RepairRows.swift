import AppCore
import Foundation
import GRDB

/// What a repair keeps of the change it was opened on: the server's outcome
/// whole, and this phone's side of it.
internal struct RepairPayload: Codable, Equatable {
    let outcome: StoredOutcome
    /// When this phone made the change.
    let madeAt: Double
    /// The code the change tried to set, for a code collision.
    let attemptedCode: String?
    /// The catalogue revision this phone held when the repair opened; absent
    /// from a repair opened before it was kept.
    var openedAtRevision: Int?
}

/// The `repair.kind` column: which outcome opened it.
internal enum StoredRepairKind: String {
    case field
    case codeCollision = "code_collision"
    case deleted
    case photoFailed = "photo_failed"
    case catalogueChanged = "catalogue_changed"
    case rejected

    /// Nil for an outcome that opens no repair. A photo attach refused
    /// because the server does not have the bytes (`media_missing`, or the
    /// phone's own refusal of a photo whose upload failed) is a failed
    /// photo, which Retry and Remove settle. A change that no longer fits
    /// the active catalogue (`catalogue_repair_required`) is
    /// `catalogueChanged`, which can be sent again against the current
    /// definitions or edited. So is an item change whose reference value the
    /// server refused (`target_missing`, `reference_type_mismatch`), which
    /// Edit item can point elsewhere. Every other refusal is let go.
    init?(_ outcome: StoredOutcome, command: LoggedCommand) {
        switch outcome {
        case .conflictField: self = .field
        case .conflictCodeCollision: self = .codeCollision
        case .conflictDeleted: self = .deleted
        case .rejected(let reason, _, _):
            if command.attachedPhoto != nil,
                StagedUploadFailure.photoRejectionReasons.contains(reason)
            {
                self = .photoFailed
            } else if reason == InventoryRejectedReason.catalogueRepairRequired.storageValue
                || Self.refusesReference(reason, of: command)
            {
                self = .catalogueChanged
            } else {
                self = .rejected
            }
        case .applied, .deferred: return nil
        }
    }

    private static func refusesReference(_ reason: String, of command: LoggedCommand) -> Bool {
        guard InventoryStaleReference(InventoryRejectedReason(wire: reason)) != nil,
            case .command(let command) = command
        else { return false }
        return command.carriesReferenceValue
    }
}

/// One `repair` row that is still open.
internal struct StoredRepair {
    let mutationId: String
    let entity: EntityRef
    let kind: StoredRepairKind
    let payload: RepairPayload
    let openedAt: Double
    /// The change as it was logged, or nil when this build cannot read it.
    let command: LoggedCommand?

    /// Whether keeping this phone's side is possible at all: a refusal the
    /// design has no repair for offers only Let go.
    var canKeepMine: Bool { kind != .rejected }

    /// The repair as the Sync screens read it, or nil when its row names
    /// something this build cannot show. `currentRevision` is the catalogue
    /// revision the replica holds now, which a `catalogueChanged` repair
    /// compares with the one it opened under.
    func repair(currentRevision: Int?) -> InventoryRepair? {
        guard let entityKind = InventoryEntityKind(storageValue: entity.kind) else { return nil }
        let opened = Date(timeIntervalSinceReferenceDate: openedAt)
        let madeAt = Date(timeIntervalSinceReferenceDate: payload.madeAt)
        switch payload.outcome {
        case .conflictField(let field, let mine, let theirs, let source, let at, _):
            return InventoryRepair(
                id: mutationId, entityKind: entityKind, entityId: entity.id, kind: .conflict,
                field: field,
                options: [
                    InventoryRepairOption(value: mine, source: .thisDevice, at: madeAt),
                    InventoryRepairOption(
                        value: theirs, source: source.syncSource,
                        at: Date(timeIntervalSinceReferenceDate: at)),
                ], openedAt: opened)
        case .conflictCodeCollision(_, let heldByName, let suggestedCode):
            return InventoryRepair(
                id: mutationId, entityKind: entityKind, entityId: entity.id, kind: .codeCollision,
                options: payload.attemptedCode.map {
                    [InventoryRepairOption(value: $0, source: .thisDevice, at: madeAt)]
                } ?? [], suggestedCode: suggestedCode, heldByName: heldByName, openedAt: opened)
        case .conflictDeleted(let source, let at):
            return InventoryRepair(
                id: mutationId, entityKind: entityKind, entityId: entity.id,
                kind: .deletedElsewhere,
                options: [
                    InventoryRepairOption(value: "Changed", source: .thisDevice, at: madeAt),
                    InventoryRepairOption(
                        value: "Deleted", source: source.syncSource,
                        at: Date(timeIntervalSinceReferenceDate: at)),
                ], openedAt: opened)
        case .rejected(let reason, _, _):
            return InventoryRepair(
                id: mutationId, entityKind: entityKind, entityId: entity.id,
                kind: Self.rejectedKind(kind, reason: reason),
                catalogue: catalogueRepair(currentRevision: currentRevision), openedAt: opened)
        case .applied, .deferred:
            return nil
        }
    }
}

extension StoredRepair {
    fileprivate func catalogueRepair(currentRevision: Int?) -> InventoryCatalogueRepair? {
        guard kind == .catalogueChanged else { return nil }
        var queued: InventoryCommand?
        if case .command(let command)? = command { queued = command }
        var staleReference: InventoryStaleReference?
        if case .rejected(let reason, _, _) = payload.outcome {
            staleReference = InventoryStaleReference(InventoryRejectedReason(wire: reason))
        }
        return InventoryCatalogueRepair(
            queued: queued, changes: payload.outcome.catalogueChanges,
            openedAtRevision: payload.openedAtRevision, currentRevision: currentRevision,
            staleReference: staleReference)
    }

    fileprivate static func rejectedKind(_ kind: StoredRepairKind, reason: String)
        -> InventoryRepairKind
    {
        switch kind {
        case .photoFailed: .photoFailed
        case .catalogueChanged: .catalogueChanged
        case .field, .codeCollision, .deleted, .rejected: .unrecognised(reason)
        }
    }
}

/// Reads and writes `repair` and `resolved_entry` rows inside the caller's
/// transaction.
internal enum RepairRows {
    private static let table = ReplicaSchema.repairTableName
    private static let resolvedTable = ReplicaSchema.resolvedEntryTableName

    /// Opens the repair `outcome` calls for on `entry`, if it calls for one
    /// and none is open for that mutation yet.
    static func open(for entry: LogEntry, outcome: StoredOutcome, at time: Double, in db: Database)
        throws
    {
        guard let kind = StoredRepairKind(outcome, command: entry.command) else { return }
        var attemptedCode: String?
        if case .command(let command) = entry.command { attemptedCode = command.wornCode }
        let payload = RepairPayload(
            outcome: outcome, madeAt: entry.createdAt, attemptedCode: attemptedCode,
            openedAtRevision: try SyncMeta.read(db).catalogueRevision)
        try db.execute(
            sql: """
                INSERT OR IGNORE INTO \(table)
                    (mutation_id, entity_kind, entity_id, kind, payload, opened_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                entry.mutationId, entry.entity.kind, entry.entity.id, kind.rawValue,
                try StoredJSON.encode(payload), time,
            ])
    }

    /// Every open repair whose change is still in the log awaiting it, oldest
    /// first.
    static func openRepairs(in db: Database) throws -> [StoredRepair] {
        try Row.fetchAll(db, sql: openSQL(extra: "") + " ORDER BY r.opened_at, r.mutation_id")
            .map(decode)
    }

    static func openRepair(id: String, in db: Database) throws -> StoredRepair? {
        try Row.fetchOne(db, sql: openSQL(extra: "AND r.mutation_id = ?"), arguments: [id])
            .map(decode)
    }

    /// Marks a repair resolved. `reissuedAs` and `baseRevisionFloor` record
    /// a change sent again under a new id against the server's revision.
    static func close(
        _ id: String, resolution: RepairResolution, reissuedAs: String? = nil,
        baseRevisionFloor: Int? = nil, at time: Double, in db: Database
    ) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET resolved_at = ?, resolution = ?, reissued_as = ?,
                    base_revision_floor = ?
                WHERE mutation_id = ?
                """,
            arguments: [time, resolution.rawValue, reissuedAs, baseRevisionFloor, id])
    }

    /// The revision a change sent again from a conflict is based on at
    /// least: the server's, even while the feed has not delivered it.
    static func baseRevisionFloor(reissuedAs mutationId: String, in db: Database) throws -> Int? {
        try Int.fetchOne(
            db,
            sql: "SELECT base_revision_floor FROM \(table) WHERE reissued_as = ?",
            arguments: [mutationId])
    }

    /// The id a change is logged under now: `mutationId` itself, or the id
    /// Keep mine last sent it again as, following one re-issue after
    /// another, so an Undo offered before a repair still reaches the change.
    static func latestReissue(of mutationId: String, in db: Database) throws -> String {
        var current = mutationId
        var seen: Set<String> = [current]
        while let next = try String.fetchOne(
            db, sql: "SELECT reissued_as FROM \(table) WHERE mutation_id = ?",
            arguments: [current]),
            seen.insert(next).inserted
        {
            current = next
        }
        return current
    }

    static func recordResolved(_ entry: InventoryResolvedEntry, in db: Database) throws {
        try db.execute(
            sql: """
                INSERT OR REPLACE INTO \(resolvedTable) (id, entity_id, outcome, resolved_at)
                VALUES (?, ?, ?, ?)
                """,
            arguments: [entry.id, entry.entityId, entry.outcome, storedDate(entry.resolvedAt)])
    }

    /// Every resolved entry, newest first.
    static func resolvedEntries(in db: Database) throws -> [InventoryResolvedEntry] {
        try Row.fetchAll(
            db, sql: "SELECT * FROM \(resolvedTable) ORDER BY resolved_at DESC, id"
        ).map { row in
            InventoryResolvedEntry(
                id: try row.decode(forColumn: "id"),
                entityId: try row.decode(forColumn: "entity_id"),
                outcome: try row.decode(forColumn: "outcome"),
                resolvedAt: Date(
                    timeIntervalSinceReferenceDate: try row.decode(forColumn: "resolved_at")))
        }
    }

    private static func openSQL(extra: String) -> String {
        """
        SELECT r.*, m.command AS log_command FROM \(table) r
        JOIN \(ReplicaSchema.mutationLogTableName) m ON m.mutation_id = r.mutation_id
        WHERE r.resolved_at IS NULL AND m.state IN ('conflicted', 'rejected') \(extra)
        """
    }

    private static func decode(_ row: Row) throws -> StoredRepair {
        let kind: String = try row.decode(forColumn: "kind")
        guard let storedKind = StoredRepairKind(rawValue: kind) else {
            throw InventoryReplicaError.corruptValue("repair kind \(kind)")
        }
        return StoredRepair(
            mutationId: try row.decode(forColumn: "mutation_id"),
            entity: EntityRef(
                kind: try row.decode(forColumn: "entity_kind"),
                id: try row.decode(forColumn: "entity_id")),
            kind: storedKind,
            payload: try StoredJSON.decode(
                RepairPayload.self, from: try row.decode(forColumn: "payload")),
            openedAt: try row.decode(forColumn: "opened_at"),
            command: logCommand(row))
    }

    /// The repaired change, or nil when this build cannot read it back: the
    /// repair still shows, and still offers Let go, without it.
    private static func logCommand(_ row: Row) -> LoggedCommand? {
        guard let json: String = row["log_command"],
            let stored = try? StoredJSON.decode(StoredCommand.self, from: json)
        else { return nil }
        return try? stored.logged()
    }
}

extension StoredSyncSource {
    var syncSource: InventorySyncSource {
        switch self {
        case .thisDevice: .thisDevice
        case .otherDevice(let label): .otherDevice(label: label)
        case .web: .web
        case .service(let account): .service(account: account)
        case .unrecognised(let kind, let label): .unrecognised(kind: kind, label: label)
        }
    }
}
