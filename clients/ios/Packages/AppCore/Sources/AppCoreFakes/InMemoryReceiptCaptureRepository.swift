import AppCore

/// A ``ReceiptCaptureRepository`` backed by canned answers, so a feature's
/// tests never stub a URL protocol.
///
/// An actor rather than a locked class, matching
/// ``InMemoryTransactionsRepository`` — ``callCount`` is what a
/// duplicate-submission bug would be caught with, and it has to still be
/// right under concurrent calls.
public actor InMemoryReceiptCaptureRepository: ReceiptCaptureRepository {
    public private(set) var callCount = 0
    /// Every call's parts, in call order — a test asserting what was sent
    /// needs more than a count.
    public private(set) var received: [[ReceiptPart]] = []

    private var outcomes: [Int: ReceiptOutcome]
    private var failures: [Int: RepositoryError] = [:]
    private let defaultOutcome: ReceiptOutcome

    /// - Parameters:
    ///   - defaultOutcome: answered when a call has no entry in `outcomes` and
    ///     was not told to fail.
    ///   - outcomes: canned answers by call number (1-based).
    public init(
        defaultOutcome: ReceiptOutcome = .unreadable(
            receiptURIs: ["fake://receipt"], reason: "no fixture configured"),
        outcomes: [Int: ReceiptOutcome] = [:]
    ) {
        self.defaultOutcome = defaultOutcome
        self.outcomes = outcomes
    }

    /// Answers the `call`-th call (1-based) with `outcome`.
    public func respond(onCall call: Int, with outcome: ReceiptOutcome) {
        outcomes[call] = outcome
    }

    /// Fails the `call`-th call (1-based) with `error`.
    public func fail(onCall call: Int, with error: RepositoryError) {
        failures[call] = error
    }

    public func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        callCount += 1
        received.append(parts)
        if let failure = failures[callCount] { throw failure }
        return outcomes[callCount] ?? defaultOutcome
    }
}
