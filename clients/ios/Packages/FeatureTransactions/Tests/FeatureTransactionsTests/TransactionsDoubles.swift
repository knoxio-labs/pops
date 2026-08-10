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

    /// Indexed by call number, so a parked call and the call that overtakes it
    /// each get the answer written for them rather than whichever is next off
    /// a queue.
    private let script: [Result<TransactionPage, any Error>]
    private let gatedCalls: Set<Int>

    private var held: [CheckedContinuation<Void, Never>] = []
    private var waiters: [(call: Int, continuation: CheckedContinuation<Void, Never>)] = []

    /// - Parameters:
    ///   - script: the answer to the first call, the second, and so on.
    ///   - gating: 1-based call numbers to park inside until ``release()``.
    internal init(script: [Result<TransactionPage, any Error>], gating gatedCalls: Set<Int> = []) {
        self.script = script
        self.gatedCalls = gatedCalls
    }

    internal var callCount: Int { requestedCursors.count }

    internal func transactions(after cursor: String?) async throws -> TransactionPage {
        requestedCursors.append(cursor)
        let call = requestedCursors.count
        resumeWaiters()

        if gatedCalls.contains(call) {
            await withCheckedContinuation { held.append($0) }
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

    /// Lets every parked call go.
    internal func release() {
        for continuation in held { continuation.resume() }
        held = []
    }

    /// Returns once at least `call` calls have been entered. The handshake that
    /// makes "a response landing after a refresh" deterministic rather than a
    /// sleep.
    internal func waitUntilCalled(_ call: Int) async {
        guard requestedCursors.count < call else { return }
        await withCheckedContinuation { waiters.append((call, $0)) }
    }

    private func resumeWaiters() {
        let reached = waiters.filter { $0.call <= requestedCursors.count }
        waiters.removeAll { $0.call <= requestedCursors.count }
        for waiter in reached { waiter.continuation.resume() }
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

/// Something a repository could plausibly throw that this app has never heard
/// of — a decoding failure, a URL error, anything from a layer below.
internal struct UnrecognisedRepositoryFailure: Error {}
