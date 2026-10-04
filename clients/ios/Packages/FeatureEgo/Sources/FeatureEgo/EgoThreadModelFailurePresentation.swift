import AppCore

internal enum EgoThreadModelFailurePresentation {
    static func repositoryFailure(for error: any Error) -> RepositoryError {
        (error as? RepositoryError) ?? .unavailable
    }

    static func failureCopy(for error: any Error) -> (message: String, retryable: Bool) {
        guard let error = error as? RepositoryError else {
            return ("Ego couldn't complete the request. Try again.", true)
        }
        switch error {
        case .unavailable:
            return ("Ego is unavailable. Try again.", true)
        case .unauthorized:
            return ("Your session needs attention before Ego can continue.", false)
        case .contractMismatch:
            return ("Ego returned a response this app can't read.", false)
        case .conflict:
            return ("This conversation changed. Reload it before trying again.", false)
        case .transport(let failure):
            return (
                "Ego couldn't complete the request. Try again.",
                failure.popsError?.retryable ?? true
            )
        case .dependencyNotBound:
            return ("Ego isn't available in this app.", false)
        }
    }
}
