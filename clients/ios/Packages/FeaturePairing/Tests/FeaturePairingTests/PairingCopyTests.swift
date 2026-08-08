import AppCore
import Foundation
import Testing

@testable import FeaturePairing

/// The screen's words, checked for the two properties that make the error
/// taxonomy worth having: every failure says something, and no two failures say
/// the same thing.
///
/// Without the second, adding a case to `PairingError` and forgetting to give
/// it copy is invisible — the `switch` still compiles because a neighbouring
/// case was copied into it, and the person is told to generate a new code when
/// the real problem was a rate limit.
@Suite("Pairing copy")
internal struct PairingCopyTests {
    private static let everyFailure: [PairingError] = [
        .codeRejected,
        .rateLimited(retryAfterSeconds: 30),
        .rateLimited(retryAfterSeconds: nil),
        .invalidRequest,
        .unreachable,
        .keyGenerationFailed,
        .credentialStorageFailed,
        .dependencyNotBound,
    ]

    @Test("every failure has something to say", arguments: PairingCopyTests.everyFailure)
    func everyFailureHasCopy(error: PairingError) {
        let message = PairingCopy.message(for: error)

        #expect(!message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    @Test("no two failures say the same thing")
    func failuresAreDistinguishable() {
        let messages = Self.everyFailure.map(PairingCopy.message(for:))

        #expect(Set(messages).count == messages.count, "\(messages)")
    }

    /// The one pair that must never merge. Telling a rate-limited person to
    /// generate a new code sends them round the loop that produced the rate
    /// limit, and the BFM rate-limits issuance too.
    @Test("a rate limit does not read as a bad code")
    func rateLimitIsNotACodeRejection() {
        let limited = PairingCopy.message(for: .rateLimited(retryAfterSeconds: 30))

        #expect(limited != PairingCopy.message(for: .codeRejected))
        // The wait is in the words, not just in the enum — a message that
        // omitted it would leave "try again" meaning "immediately".
        #expect(limited.contains("30"))

        // And when the server did not say how long, it still says to wait
        // rather than falling back on the connection-is-broken sentence.
        let unknown = PairingCopy.message(for: .rateLimited(retryAfterSeconds: nil))
        #expect(unknown != PairingCopy.message(for: .unreachable))
        #expect(unknown != PairingCopy.message(for: .codeRejected))
    }

    /// One second is one second.
    @Test("the wait is not pluralised when it is one")
    func waitIsPluralised() {
        #expect(PairingCopy.message(for: .rateLimited(retryAfterSeconds: 1)).contains("1 second."))
        #expect(PairingCopy.message(for: .rateLimited(retryAfterSeconds: 2)).contains("2 seconds."))
    }

    @Test("every reason the button is disabled names a field")
    func everyBlockerHasAHint() {
        let problems: [PairingInputProblem] = [
            .missingServer, .missingCode, .missingName, .fieldTooLong,
        ]
        let hints = problems.map(PairingCopy.blockedHint(for:))

        #expect(hints.allSatisfy { !$0.isEmpty })
        #expect(Set(hints).count == hints.count)
    }
}
