import AppCore

/// One state per way `pair()` can fail, plus the in-flight moment before any
/// of them is known.
///
/// `rateLimited` gets two rows rather than one. It is a single
/// ``PairingError`` case, but its two forms — a wait given, and none — read
/// as different sentences in `PairingCopy.message(for:)`, and that is exactly
/// the kind of difference this catalogue exists to make reviewable.
@MainActor
internal enum PairingFailureStates {
    internal static let all: [DesignState] = [
        DesignState("pairing", "Pairing in progress") {
            PairingAttemptState(outcome: .hangs)
        },
        DesignState("code-rejected", "Code rejected") {
            PairingAttemptState(outcome: .fails(.codeRejected))
        },
        DesignState("rate-limited", "Rate limited, with a wait") {
            PairingAttemptState(outcome: .fails(.rateLimited(retryAfterSeconds: 42)))
        },
        DesignState("rate-limited-unknown", "Rate limited, no wait given") {
            PairingAttemptState(outcome: .fails(.rateLimited(retryAfterSeconds: nil)))
        },
        DesignState("invalid-request", "This build sent something the server refused") {
            PairingAttemptState(outcome: .fails(.invalidRequest))
        },
        DesignState("unreachable", "Server unreachable") {
            PairingAttemptState(outcome: .fails(.unreachable))
        },
        DesignState("key-generation-failed", "Device could not create its key") {
            PairingAttemptState(outcome: .fails(.keyGenerationFailed))
        },
        DesignState("credential-storage-failed", "Paired, but credentials could not be stored") {
            PairingAttemptState(outcome: .fails(.credentialStorageFailed))
        },
        DesignState("dependency-not-bound", "Pairing not wired up") {
            PairingAttemptState(outcome: .fails(.dependencyNotBound))
        },
    ]
}
