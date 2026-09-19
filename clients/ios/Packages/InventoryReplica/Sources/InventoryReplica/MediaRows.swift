import AppCore
import GRDB

/// Reads and writes `media` rows inside the caller's transaction.
internal enum MediaRows {
    private static let table = ReplicaSchema.mediaTableName
    static let stagedVariant = "full"

    /// The file a hash and variant is stored under.
    static func fileName(sha256: String, variant: String) -> String {
        "\(sha256)-\(variant)"
    }

    /// Records staged bytes as waiting to upload and pinned. A photo the
    /// server already has stays uploaded; one that failed is staged again.
    ///
    /// - Returns: Whether the bytes were already held, on their way or on
    ///   the server; false for new bytes and for a failed photo staged
    ///   again.
    static func stage(
        sha256: String, contentType: InventoryMediaContentType, bytes: Int, at time: Double,
        in db: Database
    ) throws -> Bool {
        guard
            let row = try Row.fetchOne(
                db, sql: "SELECT upload_state FROM \(table) WHERE sha256 = ? AND variant = ?",
                arguments: [sha256, stagedVariant])
        else {
            try db.execute(
                sql: """
                    INSERT INTO \(table) (sha256, variant, content_type, bytes, pinned,
                        upload_state, created_at, last_access)
                    VALUES (?, ?, ?, ?, 1, 'waiting', ?, ?)
                    """,
                arguments: [sha256, stagedVariant, storage(contentType), bytes, time, time])
            return false
        }
        let state: String? = row["upload_state"]
        let current = state.flatMap(StagedUploadState.init(rawValue:))
        switch current {
        case .waiting, .uploading:
            try touch(sha256, variant: stagedVariant, at: time, in: db)
            return true
        case .uploaded, nil:
            // The server holds these bytes: this phone sent them, or they are
            // a copy it cached from the server.
            try db.execute(
                sql: """
                    UPDATE \(table) SET upload_state = 'uploaded', last_access = ?
                    WHERE sha256 = ? AND variant = ?
                    """,
                arguments: [time, sha256, stagedVariant])
            return true
        case .failed:
            try db.execute(
                sql: """
                    UPDATE \(table) SET pinned = 1, upload_state = 'waiting', upload_failure = NULL,
                        missing_retries = 0, content_type = ?, bytes = ?, last_access = ?
                    WHERE sha256 = ? AND variant = ?
                    """,
                arguments: [storage(contentType), bytes, time, sha256, stagedVariant])
            return false
        }
    }

    /// What the drain sends next, oldest first.
    static func waiting(in db: Database) throws -> [StagedUpload] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT sha256, content_type FROM \(table)
                WHERE upload_state = 'waiting' ORDER BY created_at, sha256
                """
        ).map { row in
            let type: String? = row["content_type"]
            return StagedUpload(
                sha256: row["sha256"], contentType: type == "heic" ? .heic : .jpeg)
        }
    }

    static func setState(
        _ state: StagedUploadState, failure: StagedUploadFailure? = nil, of sha256: String,
        in db: Database
    ) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET upload_state = ?, upload_failure = ?
                WHERE sha256 = ? AND variant = ? AND upload_state IS NOT NULL
                """,
            arguments: [state.rawValue, failure?.rawValue, sha256, stagedVariant])
    }

    /// Returns uploads a pass the app did not live to finish left in flight.
    static func requeueUploading(in db: Database) throws {
        try db.execute(
            sql: "UPDATE \(table) SET upload_state = 'waiting' WHERE upload_state = 'uploading'")
    }

    /// The server took the bytes: they stay pinned only while a change
    /// still waits to attach them.
    static func markUploaded(_ sha256: String, in db: Database) throws {
        try setState(.uploaded, of: sha256, in: db)
        try releaseUnlessAwaited(sha256, in: db)
    }

    /// The server applied an attach of the bytes, which it could only do
    /// holding them.
    static func settleAttach(_ sha256: String, in db: Database) throws {
        try setState(.uploaded, of: sha256, in: db)
        try releaseUnlessAwaited(sha256, in: db)
    }

    /// Unpins the bytes unless a change in the log still attaches them.
    static func releaseUnlessAwaited(_ sha256: String, in db: Database) throws {
        guard try !isAwaited(sha256, in: db) else { return }
        try db.execute(
            sql: "UPDATE \(table) SET pinned = 0 WHERE sha256 = ? AND variant = ?",
            arguments: [sha256, stagedVariant])
    }

    /// Stages held bytes again for Retry: waiting, pinned, with the
    /// automatic re-stage allowance restored. Bytes the phone never staged
    /// have no row, and the attach is simply sent again.
    static func restage(_ sha256: String, in db: Database) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET upload_state = 'waiting', upload_failure = NULL, pinned = 1,
                    missing_retries = 0
                WHERE sha256 = ? AND variant = ? AND upload_state IS NOT NULL
                """,
            arguments: [sha256, stagedVariant])
    }

    /// Stages held bytes again after the server answered `media_missing`,
    /// once per Retry.
    ///
    /// - Returns: False when the phone never staged them, or already did
    ///   this, so the refusal should open a repair instead.
    static func restageAfterMissing(_ sha256: String, in db: Database) throws -> Bool {
        try db.execute(
            sql: """
                UPDATE \(table) SET upload_state = 'waiting', upload_failure = NULL, pinned = 1,
                    missing_retries = missing_retries + 1
                WHERE sha256 = ? AND variant = ? AND upload_state IS NOT NULL
                    AND missing_retries < 1
                """,
            arguments: [sha256, stagedVariant])
        return db.changesCount > 0
    }

    /// Hashes an attach must wait for: staged and not yet on the server.
    static func unsent(in db: Database) throws -> Set<String> {
        Set(
            try String.fetchAll(
                db,
                sql: """
                    SELECT sha256 FROM \(table)
                    WHERE upload_state IN ('waiting', 'uploading', 'failed')
                    """))
    }

    /// Staged photos the server refused, or whose bytes are gone.
    static func failed(in db: Database) throws -> [(String, StagedUploadFailure)] {
        try Row.fetchAll(
            db,
            sql: "SELECT sha256, upload_failure FROM \(table) WHERE upload_state = 'failed'"
        ).map { row in
            let failure: String? = row["upload_failure"]
            return (row["sha256"], failure.flatMap(StagedUploadFailure.init) ?? .bytesMissing)
        }
    }

    /// How far every staged photo got, by hash.
    static func uploads(in db: Database) throws -> [String: InventoryPhotoUpload] {
        var uploads: [String: InventoryPhotoUpload] = [:]
        for row in try Row.fetchAll(
            db,
            sql: """
                SELECT sha256, upload_state, upload_failure FROM \(table)
                WHERE upload_state IS NOT NULL
                """)
        {
            let state: String = row["upload_state"]
            let failure: String? = row["upload_failure"]
            switch StagedUploadState(rawValue: state) {
            case .waiting: uploads[row["sha256"]] = .waiting
            case .uploading: uploads[row["sha256"]] = .uploading
            case .uploaded: uploads[row["sha256"]] = .uploaded
            case .failed:
                uploads[row["sha256"]] = .failed(
                    failure.flatMap(StagedUploadFailure.init)?.failure ?? .bytesMissing)
            case nil: throw InventoryReplicaError.corruptValue("upload state \(state)")
            }
        }
        return uploads
    }

    /// Whether the phone holds bytes for this hash in the staged variant.
    static func holdsStaged(_ sha256: String, in db: Database) throws -> Bool {
        try Bool.fetchOne(
            db, sql: "SELECT 1 FROM \(table) WHERE sha256 = ? AND variant = ?",
            arguments: [sha256, stagedVariant]) ?? false
    }

    static func touch(_ sha256: String, variant: String, at time: Double, in db: Database) throws {
        try db.execute(
            sql: "UPDATE \(table) SET last_access = ? WHERE sha256 = ? AND variant = ?",
            arguments: [time, sha256, variant])
    }

    /// Whether a change still in the log (not yet applied, or refused and
    /// waiting for a repair) attaches these bytes.
    private static func isAwaited(_ sha256: String, in db: Database) throws -> Bool {
        try MutationLogRows.entries(in: MutationState.awaitingServer + [.sending], db).contains {
            $0.command.attachedPhoto == sha256
        }
    }

    private static func storage(_ type: InventoryMediaContentType) -> String {
        switch type {
        case .jpeg: "jpeg"
        case .heic: "heic"
        }
    }
}

extension LoggedCommand {
    /// The hash an `item.attachPhoto` references, for any other change nil.
    var attachedPhoto: String? {
        guard case .command(.attachPhoto(_, let sha256, _)) = self else { return nil }
        return sha256
    }
}
