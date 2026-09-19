import AppCore

/// Why a write or an Undo did not land, kept precise enough for the alert to
/// say who won a conflict or why the server refused, rather than one sentence
/// for every failure.
internal enum InventoryWriteFailure: Hashable, Sendable {
    case repository(RepositoryError)
    case command(InventoryCommandError)

    /// What to show for `error`, or nil when there is nobody to tell: a
    /// screen that went away mid-write was cancelled, not refused.
    @MainActor
    internal static func reporting(_ error: any Error) -> InventoryWriteFailure? {
        guard !(Task.isCancelled || error is CancellationError) else { return nil }
        if let command = error as? InventoryCommandError { return .command(command) }
        return .repository(error as? RepositoryError ?? .transport(String(describing: error)))
    }
}
