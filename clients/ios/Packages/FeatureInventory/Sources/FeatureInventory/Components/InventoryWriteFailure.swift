import AppCore

/// Why a write or an Undo did not land, kept precise enough for the alert to
/// say who won a conflict or why the server refused, rather than one sentence
/// for every failure.
internal enum InventoryWriteFailure: Hashable, Sendable {
    case repository(RepositoryError)
    case command(InventoryCommandError)
    /// The phone itself had no room for the change
    /// (`InventoryStorageError.full`), not a refusal by anyone.
    case storageFull

    /// What to show for `error`, or nil when there is nobody to tell: a
    /// screen that went away mid-write was cancelled, not refused.
    ///
    /// Judged by whether *this* task — the one asking to report the error —
    /// is cancelled, not by the error's own type. A command can throw
    /// `CancellationError` for reasons that have nothing to do with the form
    /// going away (an inner request superseded by a later one, a shared
    /// upload cancelled by an unrelated retry), and the submitting task keeps
    /// running regardless: `submit()`'s `Task { }` is unstructured, not a
    /// child of the view, so nothing tears it down when a sheet closes. Once
    /// treating `error is CancellationError` as "nothing to report" swallowed
    /// exactly that case: `submit()` returned `false` and nothing told the
    /// form why, so the create sheet neither dismissed nor showed an error —
    /// it just sat there. If this task is still running, its caller is still
    /// waiting for an answer, and it gets one.
    @MainActor
    internal static func reporting(_ error: any Error) -> InventoryWriteFailure? {
        guard !Task.isCancelled else { return nil }
        if let command = error as? InventoryCommandError { return .command(command) }
        if error as? InventoryStorageError == .full { return .storageFull }
        return .repository(error as? RepositoryError ?? .transport(String(describing: error)))
    }
}
