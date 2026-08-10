import AppCore
import Foundation
import Testing

/// A repository whose every answer the test writes out, and which records what
/// it was asked for.
///
/// `InMemoryTransactionsRepository` in `AppCoreFakes` models a real paged list
/// and is what most tests here use. This one exists for the questions that one
/// cannot answer: exactly which cursor a retry sent, what happens when a
/// response lands after the list it was for has been thrown away, and what a
/// repository throwing something that is not a ``RepositoryError`` does to a
/// screen.
///
/// An actor rather than a locked class for the same reason the fake is one: the
/// call count is what the paging tests assert on, and it has to still be right
/// when several requests race.
internal actor ScriptedTransactionsRepository: TransactionsRepository {
    /// Every cursor this was asked for, in order. `nil` is a first page.
    internal private(set) var requestedCursors: [String?] = []

    /// Every detail fetch this was asked for, in order.
    internal private(set) var requestedDetailIDs: [Transaction.ID] = []

    /// Indexed by call number, so a parked call and the call that overtakes it
    /// each get the answer written for them rather than whichever is next off
    /// a queue.
    private let script: [Result<TransactionPage, any Error>]

    /// The answers to the first detail fetch, the second, and so on. `nil` is a
    /// transaction finance no longer has — the case that is an outcome rather
    /// than a failure, and therefore not expressible as a thrown error.
    private let detailScript: [Result<TransactionDetail?, any Error>]

    private var pageGate: CallGate
    private var detailGate: CallGate

    /// - Parameters:
    ///   - script: the answer to the first call, the second, and so on.
    ///   - detailScript: the same, for detail fetches. Numbered separately,
    ///     because the two are separate conversations and a test about one
    ///     should not have to count the other's calls.
    ///   - gating: 1-based page-call numbers to park inside until ``release()``.
    ///   - gatingDetail: the same, for detail calls.
    internal init(
        script: [Result<TransactionPage, any Error>] = [],
        detailScript: [Result<TransactionDetail?, any Error>] = [],
        gating gatedCalls: Set<Int> = [],
        gatingDetail gatedDetailCalls: Set<Int> = []
    ) {
        self.script = script
        self.detailScript = detailScript
        pageGate = CallGate(gating: gatedCalls)
        detailGate = CallGate(gating: gatedDetailCalls)
    }

    internal var callCount: Int { requestedCursors.count }

    internal var detailCallCount: Int { requestedDetailIDs.count }

    internal func transactions(after cursor: String?) async throws -> TransactionPage {
        requestedCursors.append(cursor)
        let call = requestedCursors.count

        if pageGate.enter(call: call) {
            await withCheckedContinuation { pageGate.park($0) }
        }

        guard call <= script.count else {
            // A test that ran off the end of its own script asserted something
            // other than what it meant to. Loud, rather than a plausible-looking
            // empty page.
            Issue.record("call \(call) has no scripted answer (script has \(script.count))")
            throw RepositoryError.transport("script exhausted")
        }
        return try script[call - 1].get()
    }

    internal func transactionDetail(id: Transaction.ID) async throws -> TransactionDetail? {
        requestedDetailIDs.append(id)
        let call = requestedDetailIDs.count

        if detailGate.enter(call: call) {
            await withCheckedContinuation { detailGate.park($0) }
        }

        guard call <= detailScript.count else {
            // Same reasoning as the page script: a test that ran off the end of
            // its own script asserted something other than what it meant to.
            // Loud, rather than a plausible-looking absence — which here would
            // be indistinguishable from the not-found case under test.
            Issue.record(
                "detail call \(call) has no scripted answer (script has \(detailScript.count))")
            throw RepositoryError.transport("detail script exhausted")
        }
        return try detailScript[call - 1].get()
    }

    /// Lets every parked call go, whichever conversation it is parked in.
    internal func release() {
        pageGate.release()
        detailGate.release()
    }

    /// Returns once at least `call` page calls have been entered. The handshake
    /// that makes "a response landing after a refresh" deterministic rather
    /// than a sleep.
    internal func waitUntilCalled(_ call: Int) async {
        guard requestedCursors.count < call else { return }
        await withCheckedContinuation { pageGate.wait(for: call, on: $0) }
    }

    /// The same, for detail calls.
    internal func waitUntilDetailCalled(_ call: Int) async {
        guard requestedDetailIDs.count < call else { return }
        await withCheckedContinuation { detailGate.wait(for: call, on: $0) }
    }
}

/// The parking and handshaking half of ``ScriptedTransactionsRepository``, held
/// once per conversation it scripts.
///
/// Two conversations run through that double — pages and details — and each
/// needs its own call numbering, its own parked calls and its own waiters.
/// Sharing one set would make "hold the second call" mean something different
/// depending on whether anybody happened to open a row.
internal struct CallGate {
    private let gated: Set<Int>
    private var held: [CheckedContinuation<Void, Never>] = []
    private var waiters: [(call: Int, continuation: CheckedContinuation<Void, Never>)] = []

    internal init(gating gated: Set<Int> = []) {
        self.gated = gated
    }

    /// Wakes anything waiting for this call or an earlier one, and says whether
    /// this call is one the test asked to hold.
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

extension Result where Success == TransactionPage, Failure == any Error {
    /// A page of `transactions`, followed by `nextCursor` — `nil` for the last.
    internal static func page(_ transactions: [Transaction], next: String?) -> Self {
        .success(TransactionPage(transactions: transactions, nextCursor: next))
    }

    internal static func failing(_ error: any Error) -> Self {
        .failure(error)
    }
}

extension Result where Success == TransactionDetail?, Failure == any Error {
    internal static func detail(_ detail: TransactionDetail) -> Self { .success(detail) }

    /// Finance no longer has it. Spelled out rather than written as
    /// `.success(nil)` at every call site, so a test reads as the outcome it is
    /// about.
    internal static var gone: Self { .success(nil) }

    internal static func failing(_ error: any Error) -> Self { .failure(error) }
}

/// Something a repository could plausibly throw that this app has never heard
/// of — a decoding failure, a URL error, anything from a layer below.
internal struct UnrecognisedRepositoryFailure: Error {}
