import AppCore
import Testing

@testable import FeatureTransactions

@MainActor
@Suite("Transactions retry")
internal struct TransactionsRetryTests {
    @Test("a rate-limit retry waits before making another request")
    func rateLimitedRetryWaits() async {
        let gate = RetryWaitGate()
        let counter = RetryCounter()
        let retry = Task {
            await TransactionsRetry.perform(
                after: .rateLimited(retryAfterSeconds: 30),
                wait: { _ in await gate.pause() },
                retry: { await counter.increment() }
            )
        }

        await gate.waitUntilPaused()
        #expect(await counter.value == 0)
        await gate.release()
        await retry.value

        #expect(await counter.value == 1)
    }

    @Test("cancelling a rate-limit wait does not retry")
    func cancellingWaitDoesNotRetry() async {
        let gate = RetryWaitGate()
        let counter = RetryCounter()
        let retry = Task {
            await TransactionsRetry.perform(
                after: .rateLimited(retryAfterSeconds: 30),
                wait: { _ in await gate.pause() },
                retry: { await counter.increment() }
            )
        }

        await gate.waitUntilPaused()
        retry.cancel()
        await gate.release()
        await retry.value

        #expect(await counter.value == 0)
    }

    @Test("an unknown retry window uses the established one-minute wait")
    func unknownWindowUsesFallback() async {
        var delay: Duration?

        await TransactionsRetry.perform(
            after: .rateLimited(retryAfterSeconds: nil),
            wait: { delay = $0 },
            retry: {}
        )

        #expect(delay == .seconds(60))
    }

    @Test("non-rate-limited failures keep an immediate manual retry")
    func otherFailuresRetryImmediately() async {
        var waited = false
        var retried = false

        await TransactionsRetry.perform(
            after: .unavailable,
            wait: { _ in waited = true },
            retry: { retried = true }
        )

        #expect(!waited)
        #expect(retried)
    }
}

private actor RetryWaitGate {
    private var entered = false
    private var continuation: CheckedContinuation<Void, Never>?
    private var enteredContinuation: CheckedContinuation<Void, Never>?

    func pause() async {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            entered = true
            enteredContinuation?.resume()
            enteredContinuation = nil
        }
    }

    func waitUntilPaused() async {
        guard !entered else { return }
        await withCheckedContinuation { enteredContinuation = $0 }
    }

    func release() {
        continuation?.resume()
        continuation = nil
    }
}

private actor RetryCounter {
    private(set) var value = 0

    func increment() {
        value += 1
    }
}
