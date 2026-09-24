import AppCore
import GRDB

/// What the server's outcome for a photo attach means for the bytes behind
/// it, inside the caller's transaction.
internal enum MediaOutcomes {
    /// An attach refused as `media_missing` whose bytes this phone staged,
    /// and has not already re-staged for this reason: the bytes wait to
    /// upload again and the attach is logged again under a new id, in its
    /// place in the log, because the server answers an id it has seen with
    /// the outcome it stored. No repair opens.
    ///
    /// - Returns: False, touching nothing, for any other outcome, which the
    ///   caller records as usual.
    static func restagedAfterMissing(
        _ outcome: InventoryMutationOutcome, of entry: LogEntry, mint: () -> String,
        in db: Database
    ) throws -> Bool {
        guard case .rejected(.mediaMissing, _, _) = outcome,
            let sha256 = entry.command.attachedPhoto,
            try MediaRows.restageAfterMissing(sha256, in: db)
        else { return false }
        let newId = mint()
        try MutationLogRows.rename(entry.mutationId, to: newId, in: db)
        try MutationLogRows.update(entry.requeued(as: newId, command: entry.command), in: db)
        return true
    }
}
