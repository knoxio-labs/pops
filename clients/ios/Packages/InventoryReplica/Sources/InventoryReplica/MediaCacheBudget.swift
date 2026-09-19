import GRDB

/// Keeps the media cache under its budget (ADR-002 D11): thumbnails are
/// kept for every item, and the larger variants are evicted least recently
/// used first once they add up to more than the budget. Pinned bytes (a
/// photo staged on this phone the server has not acknowledged, or that a
/// change still waits to attach) count towards the budget but are never
/// evicted.
internal enum MediaCacheBudget {
    /// Deletes the rows of the least recently used unpinned medium and full
    /// variants until the rest fit `budget`, or nothing evictable is left.
    ///
    /// - Returns: The files the deleted rows named, for the caller to remove
    ///   once the transaction commits.
    static func evict(toFit budget: Int64, in db: Database) throws -> [String] {
        let table = ReplicaSchema.mediaTableName
        let total =
            try Int64.fetchOne(
                db, sql: "SELECT COALESCE(SUM(bytes), 0) FROM \(table) WHERE variant <> 'thumb'")
            ?? 0
        var excess = total - budget
        guard excess > 0 else { return [] }
        var victims: [(sha256: String, variant: String)] = []
        for row in try Row.fetchAll(
            db,
            sql: """
                SELECT sha256, variant, bytes FROM \(table)
                WHERE variant <> 'thumb' AND pinned = 0
                ORDER BY last_access, sha256, variant
                """)
        {
            guard excess > 0 else { break }
            victims.append((row["sha256"], row["variant"]))
            excess -= row["bytes"] as Int64
        }
        for victim in victims {
            try db.execute(
                sql: "DELETE FROM \(table) WHERE sha256 = ? AND variant = ?",
                arguments: [victim.sha256, victim.variant])
        }
        return victims.map { MediaRows.fileName(sha256: $0.sha256, variant: $0.variant) }
    }
}
