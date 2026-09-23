import AppCore
import Foundation
import GRDB

/// One change the local reducer recorded, in the order the server appends
/// its events for the same command, so the `n`th one here is the `n`th
/// `seq` the server would assign.
internal struct LocalEvent: Equatable, Sendable {
    let entity: EntityRef
    let kind: String
    let fields: [String]
}

internal enum EntitySnapshot: Codable, Equatable {
    case item(WorkingItem)
    case location(WorkingLocation)

    var ref: EntityRef {
        switch self {
        case .item(let item): item.ref
        case .location(let location): location.ref
        }
    }
}

/// What a command did to its own entity: the fields it changed and their
/// values either side. Kept on the log row, so an Undo writes `before` back
/// over exactly those fields, as the server's `event.revert` does.
internal struct PrimaryChange: Codable, Equatable {
    let eventKind: String
    let fields: [String]
    let before: EntitySnapshot
    let after: EntitySnapshot
}

/// The revision a change left on its row, and which of the application's
/// events wrote it: nil when nothing changed, as the server writes no event
/// then.
internal struct Written: Equatable, Sendable {
    let revision: Int
    let eventIndex: Int?
}

/// What applying one command to the optimistic layer did.
internal struct LocalApplication {
    let written: Written
    let events: [LocalEvent]
    let change: PrimaryChange?
    /// Every row the command wrote, its own included.
    let touched: Set<EntityRef>
    /// Rows the command depends on without writing: a move's destination, a
    /// new place's parent.
    let references: Set<EntityRef>
    /// The command's own entity's revision before it applied, nil for a
    /// create.
    let baseRevision: Int?
}

/// The phone's copy of the server's command layer
/// (`pillars/inventory/src/domain/commands/`), applied to the optimistic
/// `item` and `location` tables. It refuses what the server refuses, with the
/// server's reason, and records what the server records, change for change,
/// so the command vectors can pin one to the other. What it cannot know
/// (whether media is stored, another device's history) it leaves to the
/// server.
internal final class LocalReducer {
    let db: Database
    let now: Double
    let catalogue: InventoryCatalogue?
    let primaryEntity: EntityRef
    private(set) var events: [LocalEvent] = []
    private(set) var touched: Set<EntityRef> = []
    private(set) var change: PrimaryChange?
    var references: Set<EntityRef> = []

    private init(db: Database, now: Date, primary: EntityRef) throws {
        self.db = db
        self.now = storedDate(now)
        primaryEntity = primary
        catalogue = try SyncMeta.read(db).searchCatalogue(in: db)
    }

    /// Applies `command` to the optimistic layer inside the caller's
    /// transaction.
    ///
    /// - Throws: ``AppCore/InventoryCommandError`` when the server would
    ///   refuse it too; nothing is written then, because the caller's
    ///   transaction rolls back or the replay skips the command.
    static func apply(
        _ command: LoggedCommand, primary: EntityRef, at now: Date, in db: Database
    ) throws -> LocalApplication {
        let reducer = try LocalReducer(db: db, now: now, primary: primary)
        let baseRevision = try reducer.revision(of: primary)
        let written = try reducer.run(command)
        return LocalApplication(
            written: written, events: reducer.events, change: reducer.change,
            touched: reducer.touched.union([primary]), references: reducer.references,
            baseRevision: baseRevision)
    }

    func refusal(_ reason: InventoryRejectedReason, _ message: String) -> InventoryCommandError {
        .rejected(reason: reason, message: message)
    }

    func item(_ id: String) throws -> WorkingItem? {
        try Row.fetchOne(db, sql: "SELECT * FROM item WHERE id = ?", arguments: [id])
            .map { WorkingItem(try ItemRow.decode($0, in: nil)) }
    }

    func liveItem(_ id: String) throws -> WorkingItem {
        guard let item = try item(id), !item.isDeleted else {
            throw refusal(.targetMissing, "item \(id) does not exist")
        }
        return item
    }

    func location(_ id: String) throws -> WorkingLocation? {
        try Row.fetchOne(db, sql: "SELECT * FROM location WHERE id = ?", arguments: [id])
            .map { WorkingLocation(try LocationRow.decode($0)) }
    }

    func liveLocation(_ id: String) throws -> WorkingLocation {
        guard let location = try location(id), !location.isDeleted else {
            throw refusal(.targetMissing, "location \(id) does not exist")
        }
        return location
    }

    func revision(of ref: EntityRef) throws -> Int? {
        ref.kind == "item" ? try item(ref.id)?.revision : try location(ref.id)?.revision
    }

    /// What the server answers for a command that changed nothing: the row's
    /// current revision, and no event.
    func unchanged(_ row: some WorkingRow) -> Written {
        Written(revision: row.revision, eventIndex: nil)
    }

    /// Records a change to an existing row: nothing at all if no tracked
    /// field differs, otherwise the next revision and one event.
    func update<Entity: WorkingRow>(_ before: Entity, to after: Entity, kind: String) throws
        -> Written?
    {
        let fields = before.changedFields(to: after)
        guard !fields.isEmpty else { return nil }
        return try record(before: before, after: after, fields: fields, kind: kind)
    }

    /// Records a change whose value the server keeps outside the row (an
    /// item's photos): always the next revision and one event, even when the
    /// resulting row compares equal, because the server stamps it either way.
    func sideEffect(_ before: WorkingItem, to after: WorkingItem, kind: String) throws -> Written {
        try record(before: before, after: after, fields: ["photos"], kind: kind)
    }

    /// Records a new row at revision 1.
    func create<Entity: WorkingRow>(_ row: Entity, kind: String) throws -> Written {
        var created = row
        created.revision = 1
        try save(created)
        events.append(LocalEvent(entity: created.ref, kind: kind, fields: []))
        touched.insert(created.ref)
        if created.ref == primaryEntity, change == nil {
            change = PrimaryChange(
                eventKind: kind, fields: [], before: created.snapshot, after: created.snapshot)
        }
        return Written(revision: 1, eventIndex: events.count - 1)
    }

    private func record<Entity: WorkingRow>(
        before: Entity, after: Entity, fields: [String], kind: String
    ) throws -> Written {
        var written = after
        written.revision = before.revision + 1
        written.stamp(at: now, changedFrom: before)
        try save(written)
        events.append(LocalEvent(entity: written.ref, kind: kind, fields: fields))
        touched.insert(written.ref)
        if written.ref == primaryEntity, change == nil {
            change = PrimaryChange(
                eventKind: kind, fields: fields, before: before.snapshot, after: written.snapshot)
        }
        return Written(revision: written.revision, eventIndex: events.count - 1)
    }

    private func save(_ row: some WorkingRow) throws {
        switch row.snapshot {
        case .item(let item):
            try db.execute(
                sql: ReplicaApply.upsertSQL(ItemRow.columns, into: "item"),
                arguments: StatementArguments(try ItemRow.values(of: item.item)))
            try ReplicaSearchIndex.index(SearchDocument(item.item), catalogue: catalogue, in: db)
        case .location(let location):
            try db.execute(
                sql: ReplicaApply.upsertSQL(LocationRow.columns, into: "location"),
                arguments: StatementArguments(LocationRow.values(of: location.location)))
        }
    }
}
