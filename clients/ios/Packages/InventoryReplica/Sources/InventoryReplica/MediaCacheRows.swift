import AppCore
import Foundation
import GRDB

/// Reads and writes the media cache's `media` rows inside the caller's
/// transaction: variants fetched from the server, beside the photos this
/// phone staged (``MediaRows``).
internal enum MediaCacheRows {
    static func variantName(_ variant: InventoryPhotoVariant) -> String {
        switch variant {
        case .thumb: "thumb"
        case .medium: "medium"
        case .full: "full"
        }
    }

    /// Keeps a variant fetched from the server. A row already there, such as
    /// a photo this phone staged, keeps its upload state and pin.
    static func recordCached(
        sha256: String, variant: String, bytes: Int, at time: Double, in db: Database
    ) throws {
        try db.execute(
            sql: """
                INSERT INTO \(ReplicaSchema.mediaTableName) (sha256, variant, bytes, created_at, last_access)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (sha256, variant) DO UPDATE
                    SET bytes = excluded.bytes, last_access = excluded.last_access
                """,
            arguments: [sha256, variant, bytes, time, time])
    }

    /// The variants of a hash the replica has a row for.
    static func heldVariants(of sha256: String, in db: Database) throws -> Set<String> {
        Set(
            try String.fetchAll(
                db, sql: "SELECT variant FROM \(ReplicaSchema.mediaTableName) WHERE sha256 = ?",
                arguments: [sha256]))
    }

    /// Whether this phone staged the bytes, rather than only caching them.
    static func isStaged(_ sha256: String, in db: Database) throws -> Bool {
        try Bool.fetchOne(
            db,
            sql: """
                SELECT 1 FROM \(ReplicaSchema.mediaTableName)
                WHERE sha256 = ? AND variant = ? AND upload_state IS NOT NULL
                """,
            arguments: [sha256, MediaRows.stagedVariant]) ?? false
    }

    static func forget(_ sha256: String, variant: String, in db: Database) throws {
        try db.execute(
            sql: "DELETE FROM \(ReplicaSchema.mediaTableName) WHERE sha256 = ? AND variant = ?",
            arguments: [sha256, variant])
    }
}
