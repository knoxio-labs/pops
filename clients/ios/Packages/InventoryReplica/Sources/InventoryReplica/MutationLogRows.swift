import GRDB

/// Where one logged mutation stands with the server.
internal enum MutationState: String, Codable, Sendable {
    case queued
    case sending
    case applied
    case conflicted
    case rejected
    case deferred

    /// Not in flight and not applied, so an Undo can simply drop it.
    var isCancellable: Bool { self != .sending && self != .applied }

    /// Not applied and not in flight: what may still depend on a mutation
    /// the log drops or sends again under a new id.
    static let awaitingServer: [Self] = [.queued, .deferred, .conflicted, .rejected]
}

/// One row of `mutation_log`.
internal struct LogEntry: Sendable {
    let localSeq: Int64?
    let mutationId: String
    let entity: EntityRef
    var command: LoggedCommand
    var dependsOn: [String]
    var baseRevision: Int?
    var state: MutationState
    var outcome: StoredOutcome?
    var settlesAtSeq: Int?
    var touched: Set<EntityRef>
    var change: PrimaryChange?
    var attempts: Int
    let createdAt: Double
    var lastAttemptAt: Double?
}

/// Reads and writes `mutation_log` rows inside the caller's transaction.
internal enum MutationLogRows {
    private static let table = ReplicaSchema.mutationLogTableName

    static func insert(_ entry: LogEntry, in db: Database) throws {
        try db.execute(
            sql: """
                INSERT INTO \(table) (mutation_id, entity_kind, entity_id, command, depends_on,
                    base_revision, state, outcome, outcome_seq, settles_at_seq, touched, change,
                    attempts, created_at, last_attempt_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: StatementArguments(
                [entry.mutationId, entry.entity.kind, entry.entity.id] + (try mutableColumns(entry))
                    + [entry.createdAt, entry.lastAttemptAt]))
    }

    static func update(_ entry: LogEntry, in db: Database) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET command = ?, depends_on = ?, base_revision = ?, state = ?,
                    outcome = ?, outcome_seq = ?, settles_at_seq = ?, touched = ?, change = ?,
                    attempts = ?, last_attempt_at = ?
                WHERE mutation_id = ?
                """,
            arguments: StatementArguments(
                (try mutableColumns(entry)) + [entry.lastAttemptAt, entry.mutationId]))
    }

    static func delete(_ mutationIds: [String], in db: Database) throws {
        for id in mutationIds {
            try db.execute(sql: "DELETE FROM \(table) WHERE mutation_id = ?", arguments: [id])
        }
    }

    /// Gives a logged mutation a new id in its place in the log, and points
    /// whatever depended on it at the new id.
    static func rename(_ mutationId: String, to newId: String, in db: Database) throws {
        try db.execute(
            sql: "UPDATE \(table) SET mutation_id = ? WHERE mutation_id = ?",
            arguments: [newId, mutationId])
        for var entry in try entries(in: MutationState.awaitingServer, db)
        where entry.dependsOn.contains(mutationId) {
            entry.dependsOn = entry.dependsOn.map { $0 == mutationId ? newId : $0 }.sorted()
            try update(entry, in: db)
        }
    }

    static func entry(mutationId: String, in db: Database) throws -> LogEntry? {
        try Row.fetchOne(
            db, sql: "SELECT * FROM \(table) WHERE mutation_id = ?", arguments: [mutationId]
        ).map(decode)
    }

    /// What this phone's own change the server recorded as event `seq` did,
    /// if the log still holds it.
    static func change(ofOutcomeSeq seq: Int, in db: Database) throws -> PrimaryChange? {
        try Row.fetchOne(
            db, sql: "SELECT * FROM \(table) WHERE outcome_seq = ?", arguments: [seq]
        ).map(decode)?.change
    }

    /// Every row in log order, optionally only those in `states`.
    static func entries(in states: [MutationState]? = nil, _ db: Database) throws -> [LogEntry] {
        let filter = states.map { states in
            "WHERE state IN (\(states.map { "'\($0.rawValue)'" }.joined(separator: ", ")))"
        }
        return try Row.fetchAll(
            db, sql: "SELECT * FROM \(table) \(filter ?? "") ORDER BY local_seq"
        ).map(decode)
    }

    /// The rows whose last replay wrote something, which a rebase resets.
    static func entriesWithTouchedRows(in db: Database) throws -> [LogEntry] {
        try Row.fetchAll(
            db, sql: "SELECT * FROM \(table) WHERE touched <> '[]' ORDER BY local_seq"
        ).map(decode)
    }

    /// The rows a rebase replays over the base: every pending one, and every
    /// applied one the feed has not yet caught up to.
    static func replayable(since: Int?, in db: Database) throws -> [LogEntry] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM \(table)
                WHERE state IN ('queued', 'sending', 'deferred')
                    OR (state = 'applied' AND (? IS NULL OR settles_at_seq IS NULL OR settles_at_seq > ?))
                ORDER BY local_seq
                """, arguments: [since, since]
        ).map(decode)
    }

    private static func mutableColumns(_ entry: LogEntry) throws -> [(
        any DatabaseValueConvertible
    )?] {
        [
            try StoredJSON.encode(StoredCommand(entry.command)),
            try StoredJSON.encode(entry.dependsOn), entry.baseRevision, entry.state.rawValue,
            try entry.outcome.map(StoredJSON.encode), entry.outcome?.appliedSeq,
            entry.settlesAtSeq,
            try StoredJSON.encode(entry.touched.sorted { ($0.kind, $0.id) < ($1.kind, $1.id) }),
            try entry.change.map(StoredJSON.encode), entry.attempts,
        ]
    }

    private static func decode(_ row: Row) throws -> LogEntry {
        let state: String = try row.decode(forColumn: "state")
        guard let mutationState = MutationState(rawValue: state) else {
            throw InventoryReplicaError.corruptValue("mutation state \(state)")
        }
        let outcome: String? = try row.decode(forColumn: "outcome")
        let change: String? = try row.decode(forColumn: "change")
        return LogEntry(
            localSeq: try row.decode(forColumn: "local_seq"),
            mutationId: try row.decode(forColumn: "mutation_id"),
            entity: EntityRef(
                kind: try row.decode(forColumn: "entity_kind"),
                id: try row.decode(forColumn: "entity_id")),
            command: try StoredJSON.decode(
                StoredCommand.self, from: try row.decode(forColumn: "command")
            ).logged(),
            dependsOn: try StoredJSON.decode(
                [String].self, from: try row.decode(forColumn: "depends_on")),
            baseRevision: try row.decode(forColumn: "base_revision"), state: mutationState,
            outcome: try outcome.map { try StoredJSON.decode(StoredOutcome.self, from: $0) },
            settlesAtSeq: try row.decode(forColumn: "settles_at_seq"),
            touched: Set(
                try StoredJSON.decode([EntityRef].self, from: try row.decode(forColumn: "touched"))),
            change: try change.map { try StoredJSON.decode(PrimaryChange.self, from: $0) },
            attempts: try row.decode(forColumn: "attempts"),
            createdAt: try row.decode(forColumn: "created_at"),
            lastAttemptAt: try row.decode(forColumn: "last_attempt_at"))
    }
}
