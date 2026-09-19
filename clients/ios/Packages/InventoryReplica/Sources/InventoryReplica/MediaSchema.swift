import GRDB

extension ReplicaSchema {
    static let mediaTableName = "media"

    /// Photo bytes the replica holds, one row per hash and variant, the file
    /// itself in ``InventoryMediaFiles`` (ADR-002's `media` table).
    ///
    /// - `upload_state`: set only on a photo this phone staged (its `full`
    ///   variant): waiting, uploading, uploaded or failed, with
    ///   `upload_failure` saying why.
    /// - `pinned`: the bytes may not be evicted, because the server has not
    ///   acknowledged them or a change still waits to attach them.
    /// - `missing_retries`: how often an attach the server refused as
    ///   `media_missing` re-staged these bytes on its own, so a server that
    ///   keeps losing them opens a repair rather than looping.
    /// - `last_access`: when the bytes were last written or read, for
    ///   eviction.
    static func registerMedia(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v5_media") { db in
            try db.execute(
                sql: """
                    CREATE TABLE \(mediaTableName) (
                        sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
                        variant TEXT NOT NULL CHECK (variant IN ('thumb', 'medium', 'full')),
                        content_type TEXT CHECK (content_type IN ('jpeg', 'heic')),
                        bytes INTEGER NOT NULL,
                        pinned INTEGER NOT NULL DEFAULT 0,
                        upload_state TEXT
                            CHECK (upload_state IN ('waiting', 'uploading', 'uploaded', 'failed')),
                        upload_failure TEXT,
                        missing_retries INTEGER NOT NULL DEFAULT 0,
                        created_at REAL NOT NULL,
                        last_access REAL NOT NULL,
                        PRIMARY KEY (sha256, variant)
                    );
                    CREATE INDEX media_upload_state ON \(mediaTableName)(upload_state);
                    CREATE INDEX media_last_access ON \(mediaTableName)(pinned, last_access);
                    """)
        }
    }
}
