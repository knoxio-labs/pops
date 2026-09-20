import GRDB

extension ReplicaSchema {
    /// The "type arrived" sheet's inputs: each item's migrated free-text type,
    /// and the record of which newly arrived types are still to be asked
    /// about and which were already asked (the shown-once flag).
    ///
    /// Rows already stored came from a server that did not send `legacyType`,
    /// and an upsert by revision would never rewrite them. Giving a
    /// downloaded replica an epoch no server issued makes its next feed
    /// request a `409 resync_required`, which the store already answers with
    /// a fresh snapshot while keeping the mutation log, so every row comes
    /// back with its legacy type and nothing staged on the phone is lost.
    /// A first download interrupted part way cannot take that route (its
    /// resumed pages would land on top of rows that lack the column), so it
    /// starts again from nothing instead.
    static func registerTypeArrivals(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v6_type_arrivals") { db in
            for table in itemLayers {
                try db.execute(sql: "ALTER TABLE \(table) ADD COLUMN legacy_type TEXT")
            }
            try db.execute(
                sql: """
                    ALTER TABLE sync_meta ADD COLUMN type_arrivals TEXT NOT NULL
                        DEFAULT '{"awaiting":[],"settled":[]}'
                    """)
            try db.execute(
                sql: "UPDATE sync_meta SET epoch = ? WHERE since IS NOT NULL",
                arguments: [legacyTypeResyncEpoch])
            let interrupted = try Bool.fetchOne(
                db, sql: "SELECT snapshot_cursor IS NOT NULL FROM sync_meta WHERE id = 1")
            guard interrupted == true else { return }
            for table in itemLayers + locationLayers + ["event", "item_fts"] {
                try db.execute(sql: "DELETE FROM \(table)")
            }
            try db.execute(
                sql: """
                    UPDATE sync_meta SET epoch = NULL, snapshot_cursor = NULL, snapshot_total = 0,
                        snapshot_rows = 0
                    """)
        }
    }

    /// Never an epoch the server issues: the server's are random ids.
    static let legacyTypeResyncEpoch = "replica-v6-legacy-type-resync"
}

/// `sync_meta.type_arrivals`: the keys of types a catalogue change added
/// that the sheet has not asked about, oldest first, and the keys it has.
/// A settled key is never queued again, so a type that leaves the catalogue
/// and comes back is not asked about twice.
internal struct StoredTypeArrivals: Codable, Equatable {
    var awaiting: [String] = []
    var settled: [String] = []

    /// Queues every key in `added` that is neither waiting nor settled.
    mutating func queue(_ added: [String]) {
        for key in added where !awaiting.contains(key) && !settled.contains(key) {
            awaiting.append(key)
        }
    }

    mutating func settle(_ key: String) {
        awaiting.removeAll { $0 == key }
        if !settled.contains(key) { settled.append(key) }
    }
}
