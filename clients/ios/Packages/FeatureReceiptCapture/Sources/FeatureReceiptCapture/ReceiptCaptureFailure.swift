import AppCore

extension RepositoryError {
    /// ``ReceiptCaptureRepository`` does not constrain what it throws, so a
    /// conforming implementation may throw anything. Everything unrecognised
    /// becomes ``RepositoryError/transport(_:)``, whose payload is a
    /// diagnostic and never reaches a screen.
    internal static func describing(_ error: Error) -> RepositoryError {
        error as? RepositoryError ?? .transport(String(describing: error))
    }
}

extension Error {
    /// A submission cancelled because its view went away is not a failure to
    /// report. Recording one would leave the error state on a screen nobody
    /// is looking at, ready for the next person who navigates back to it.
    ///
    /// Both halves are needed. `CancellationError` is what Swift concurrency
    /// throws, but a repository built on URLSession surfaces the same event
    /// as `URLError(.cancelled)` wrapped in whatever its layers wrap things
    /// in — and this module may not name any of those types. `Task.isCancelled`
    /// at the catch site answers the question those types were only evidence
    /// for: is the work that produced this error still wanted.
    internal var isCancellation: Bool {
        Task.isCancelled || self is CancellationError
    }
}
