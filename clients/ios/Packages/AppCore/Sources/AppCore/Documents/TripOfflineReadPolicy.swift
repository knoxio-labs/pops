import Foundation

/// Restricts last-good read fallback to explicit unavailability; it never grants access to another pairing's store.
public enum TripOfflineReadPolicy {
    /// The caller must still verify the captured current owner and local integrity. Unknown transport strings,
    /// missing originals, authorization failures, configuration refusals and malformed responses fail closed.
    public static func permitsLastVerifiedRead(after error: any Error) -> Bool {
        if let error = error as? RepositoryError { return error == .unavailable }
        guard let error = error as? URLError else { return false }
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut,
            .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return true
        default: return false
        }
    }
}
