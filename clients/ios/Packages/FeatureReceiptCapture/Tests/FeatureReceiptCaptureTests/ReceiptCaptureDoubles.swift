import AppCore
import Testing

/// A repository whose every answer the test writes out, and which records
/// what it was asked for.
///
/// `InMemoryReceiptCaptureRepository` in `AppCoreFakes` is what most tests
/// here use. This one exists for the question that one cannot answer
/// deterministically: what happens when two submissions race, which needs a
/// call held open until the test says to let it go.
///
/// An actor rather than a locked class, matching
/// `ScriptedTransactionsRepository` in `FeatureTransactionsTests` and for the
/// same reason: the call count is what the race test asserts on, and it has
/// to still be right when several calls overlap.
internal actor ScriptedReceiptCaptureRepository: ReceiptCaptureRepository {
    /// Every call's parts, in call order.
    internal private(set) var received: [[ReceiptPart]] = []

    private let script: [Result<ReceiptOutcome, any Error>]
    private var gate: CallGate

    /// - Parameters:
    ///   - script: the answer to the first call, the second, and so on.
    ///   - gating: 1-based call numbers to park inside until ``release()``.
    internal init(
        script: [Result<ReceiptOutcome, any Error>] = [],
        gating gatedCalls: Set<Int> = []
    ) {
        self.script = script
        gate = CallGate(gating: gatedCalls)
    }

    internal var callCount: Int { received.count }

    internal func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        received.append(parts)
        let call = received.count

        if gate.enter(call: call) {
            await withCheckedContinuation { gate.park($0) }
        }

        guard call <= script.count else {
            Issue.record("call \(call) has no scripted answer (script has \(script.count))")
            throw RepositoryError.transport("script exhausted")
        }
        return try script[call - 1].get()
    }

    /// Lets every parked call go.
    internal func release() {
        gate.release()
    }

    /// Returns once at least `call` calls have been entered. The handshake
    /// that makes a race deterministic rather than a sleep.
    internal func waitUntilCalled(_ call: Int) async {
        guard received.count < call else { return }
        await withCheckedContinuation { gate.wait(for: call, on: $0) }
    }
}

/// The parking and handshaking half of ``ScriptedReceiptCaptureRepository``.
internal struct CallGate {
    private let gated: Set<Int>
    private var held: [CheckedContinuation<Void, Never>] = []
    private var waiters: [(call: Int, continuation: CheckedContinuation<Void, Never>)] = []

    internal init(gating gated: Set<Int> = []) {
        self.gated = gated
    }

    /// Wakes anything waiting for this call or an earlier one, and says
    /// whether this call is one the test asked to hold.
    internal mutating func enter(call: Int) -> Bool {
        let reached = waiters.filter { $0.call <= call }
        waiters.removeAll { $0.call <= call }
        for waiter in reached { waiter.continuation.resume() }
        return gated.contains(call)
    }

    internal mutating func park(_ continuation: CheckedContinuation<Void, Never>) {
        held.append(continuation)
    }

    internal mutating func wait(for call: Int, on continuation: CheckedContinuation<Void, Never>) {
        waiters.append((call, continuation))
    }

    internal mutating func release() {
        for continuation in held { continuation.resume() }
        held = []
    }
}

extension Result where Success == ReceiptOutcome, Failure == any Error {
    internal static func outcome(_ outcome: ReceiptOutcome) -> Self { .success(outcome) }

    internal static func failing(_ error: any Error) -> Self { .failure(error) }
}

/// Something a repository could plausibly throw that this app has never heard
/// of — a decoding failure, a URL error, anything from a layer below.
internal struct UnrecognisedRepositoryFailure: Error {}
