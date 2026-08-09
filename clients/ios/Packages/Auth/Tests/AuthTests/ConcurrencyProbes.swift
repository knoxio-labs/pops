import Auth
import Foundation
import Synchronization

/// Releases every waiter only once `count` of them have arrived.
///
/// The subject of this package's concurrency suites is what happens when N
/// callers hold a rejected token *at the same time*. Without a barrier a
/// scheduler that happened to run them one after another would exercise the
/// "a refresh already finished" path instead, and the assertion would pass for
/// a reason that has nothing to do with what it claims to prove.
///
/// Bounded, and releases itself when the bound is reached. A barrier built on
/// continuations parks forever when the code under test sends fewer requests
/// than the test expected — which turns a defect into a hung suite rather than
/// a failed assertion. The yield loop below cannot do that: the happy path
/// still releases the instant the last caller arrives, and the unhappy one
/// releases anyway and lets the assertions say what went wrong.
internal actor Barrier {
    private let count: Int
    private var arrived = 0

    internal init(count: Int) {
        self.count = count
    }

    internal func arriveAndWait() async {
        arrived += 1
        for _ in 0..<10_000 {
            if arrived >= count { return }
            await Task.yield()
        }
    }
}

/// A one-way switch a test flips when it is ready.
///
/// Used to hold a refresh open for as long as it takes every other caller to
/// pile up behind it — the state the single-flight logic exists for, and the
/// one a test cannot otherwise be sure it reached.
internal actor Gate {
    private var isOpen = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    internal func open() {
        isOpen = true
        for continuation in waiting { continuation.resume() }
        waiting.removeAll()
    }

    internal func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiting.append($0) }
    }
}

/// A ``TokenStore`` that counts reads.
///
/// The count is the only externally visible proof that a caller has entered
/// `DeviceSessionRefresher` and got as far as looking at the stored pair —
/// every path through it reads the store exactly once before deciding what to
/// do. It is what turns "twenty callers were probably concurrent" into
/// "nineteen callers were parked when the twentieth rotation began".
///
/// Synchronous, because ``TokenStore`` is: an actor could not witness it.
internal final class CountingTokenStore: TokenStore {
    private let wrapped: any TokenStore
    private let reads = Mutex<Int>(0)

    internal init(_ wrapped: any TokenStore) {
        self.wrapped = wrapped
    }

    internal var readCount: Int { reads.withLock { $0 } }

    internal func load() throws -> DeviceTokens? {
        reads.withLock { $0 += 1 }
        return try wrapped.load()
    }

    internal func save(_ tokens: DeviceTokens) throws {
        try wrapped.save(tokens)
    }

    internal func wipe() throws {
        try wrapped.wipe()
    }
}

/// Yields until `condition` holds, and reports whether it ever did.
///
/// Cooperative yielding rather than a sleep: the tasks this is waiting on run
/// on the same executor, so yielding is what lets them run — and the wait ends
/// the instant the condition holds rather than after a duration somebody
/// guessed. The bound exists so a regression fails the suite instead of hanging
/// it; it is not a timeout in wall-clock terms and nothing about it is timing
/// dependent.
///
/// It **returns** rather than throwing, and the difference is not stylistic.
/// Every caller has a gate to open afterwards, and a throw would skip it —
/// leaving the tasks this was waiting on parked forever on a gate nobody will
/// open, so a broken implementation would hang the suite instead of failing it.
/// That was not hypothetical: it is how the first version of these tests
/// behaved the first time the code under them was deliberately broken. Open the
/// gate unconditionally, then assert on the result.
@discardableResult
internal func waitUntil(
    _ waitingFor: String,
    _ condition: @Sendable () -> Bool
) async -> Bool {
    for _ in 0..<10_000 {
        if condition() { return true }
        await Task.yield()
    }
    return false
}
