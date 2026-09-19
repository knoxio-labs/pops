import GRDB

/// The replica's tables, per ADR-002's iOS replica design. Migrations are
/// append-only and named (D11): a shipped one is never edited, a change is a
/// new registration after it.
///
/// Items and locations each have two layers with one shape. `*_base` is the
/// last state the server sent, compared by revision; the unsuffixed table is
/// what every query reads, which is the base with this phone's pending
/// changes replayed over it.
internal enum ReplicaSchema {
    static let itemLayers = ["item_base", "item"]
    static let locationLayers = ["location_base", "location"]

    static func migrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1_replica") { db in
            for table in itemLayers { try db.execute(sql: itemTable(table)) }
            for table in locationLayers { try db.execute(sql: locationTable(table)) }
            try db.execute(sql: indexes)
            try db.execute(sql: eventTable("event", actorKinds: v1ActorKinds))
            try db.execute(sql: eventIndex)
            try db.execute(sql: syncMetaTable)
            try db.execute(sql: searchTable)
        }
        // An actor kind this build does not know is kept, not refused: the
        // wire declares it an open string (D10), and one unknown actor must
        // not fail the whole feed page it arrived on.
        migrator.registerMigration("v2_unrecognised_actor") { db in
            try db.execute(
                sql: eventTable("event_v2", actorKinds: v1ActorKinds + ["unrecognised"]))
            try db.execute(sql: "INSERT INTO event_v2 SELECT * FROM event")
            try db.execute(sql: "DROP TABLE event")
            try db.execute(sql: "ALTER TABLE event_v2 RENAME TO event")
            try db.execute(sql: eventIndex)
        }
        return migrator
    }

    private static let v1ActorKinds = ["device", "web", "service", "migration"]

    private static func itemTable(_ name: String) -> String {
        """
        CREATE TABLE \(name) (
            id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            name TEXT NOT NULL,
            type_key TEXT,
            fields TEXT NOT NULL,
            note TEXT,
            code TEXT,
            external_ids TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            lifecycle TEXT NOT NULL,
            lifecycle_changed_at REAL,
            placement_kind TEXT NOT NULL CHECK (placement_kind IN ('location', 'container', 'hand')),
            location_id TEXT,
            containing_item_id TEXT CHECK (containing_item_id IS NULL OR containing_item_id <> id),
            previous_placement_kind TEXT
                CHECK (previous_placement_kind IN ('location', 'container', 'tombstoned')),
            previous_placement_id TEXT,
            is_container INTEGER NOT NULL,
            access TEXT CHECK (access IN ('open', 'closed')),
            is_full INTEGER,
            photos TEXT NOT NULL,
            provenance TEXT,
            documents_status TEXT NOT NULL CHECK (documents_status IN ('linked', 'none', 'unavailable')),
            documents_linked TEXT NOT NULL,
            document_titles TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            deleted_at REAL,
            CHECK (
                (placement_kind = 'location' AND location_id IS NOT NULL AND containing_item_id IS NULL)
                OR (placement_kind = 'container' AND containing_item_id IS NOT NULL AND location_id IS NULL)
                OR (placement_kind = 'hand' AND location_id IS NULL AND containing_item_id IS NULL)
            ),
            CHECK ((is_container = 1) = (access IS NOT NULL)),
            CHECK ((is_container = 1) = (is_full IS NOT NULL))
        )
        """
    }

    private static func locationTable(_ name: String) -> String {
        """
        CREATE TABLE \(name) (
            id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            name TEXT NOT NULL,
            parent_id TEXT,
            sort_order INTEGER NOT NULL,
            deleted_at REAL
        )
        """
    }

    private static let indexes = """
        CREATE INDEX item_location ON item(location_id);
        CREATE INDEX item_containing ON item(containing_item_id);
        CREATE INDEX item_in_hand ON item(id) WHERE placement_kind = 'hand';
        CREATE INDEX item_containers ON item(id) WHERE is_container = 1;
        CREATE INDEX item_updated ON item(updated_at);
        """

    private static func eventTable(_ name: String, actorKinds: [String]) -> String {
        let kinds = actorKinds.map { "'\($0)'" }.joined(separator: ", ")
        return """
            CREATE TABLE \(name) (
                seq INTEGER PRIMARY KEY NOT NULL,
                entity_kind TEXT NOT NULL CHECK (entity_kind IN ('item', 'location')),
                entity_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                fields TEXT NOT NULL,
                before TEXT NOT NULL,
                after TEXT NOT NULL,
                reason TEXT,
                actor_kind TEXT NOT NULL CHECK (actor_kind IN (\(kinds))),
                actor_id TEXT,
                actor_label TEXT,
                client_time REAL,
                server_time REAL NOT NULL,
                compensates_seq INTEGER,
                undoable INTEGER NOT NULL
            )
            """
    }

    private static let eventIndex =
        "CREATE INDEX event_entity ON event(entity_kind, entity_id, seq)"

    /// One row, always present, so every write is an `UPDATE` and no read has
    /// to tell "never written" from "missing".
    private static let syncMetaTable = """
        CREATE TABLE sync_meta (
            id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
            epoch TEXT,
            since INTEGER,
            catalogue TEXT,
            catalogue_version TEXT,
            last_refresh_at REAL,
            snapshot_cursor TEXT,
            snapshot_total INTEGER NOT NULL DEFAULT 0,
            snapshot_rows INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO sync_meta (id) VALUES (1);
        """

    /// Trigram rather than word tokens because the approved matching rule is
    /// "contains", not "has a word starting with": `mmer` must find Hammer.
    /// Keyed by `item.rowid`, which an upsert preserves.
    private static let searchTable = """
        CREATE VIRTUAL TABLE item_fts USING fts5(
            name, code, note, type_label, field_text, external_ids,
            tokenize = 'trigram'
        )
        """
}
