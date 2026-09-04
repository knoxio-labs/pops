import AppCore

extension RepositoryError {
    /// ``AccountsRepository`` does not constrain what it throws, so a
    /// conforming implementation may throw anything. Everything unrecognised
    /// becomes ``RepositoryError/transport(_:)``, whose payload is a diagnostic
    /// and never reaches a screen.
    internal static func describing(_ error: Error) -> RepositoryError {
        error as? RepositoryError ?? .transport(String(describing: error))
    }
}

extension Error {
    /// A fetch cancelled because its view went away is not a failure to
    /// report. Recording one would leave the error state on a screen nobody is
    /// looking at, ready for the next person who navigates back to it.
    internal var isCancellation: Bool {
        Task.isCancelled || self is CancellationError
    }
}
