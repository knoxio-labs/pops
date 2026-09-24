import Testing
import UIKit

@testable import Pops

/// Stands in for `UIApplication`: hands out one identifier, keeps the
/// expiration handler, and records every end.
@MainActor
private final class FakeApplication {
    let granted: UIBackgroundTaskIdentifier
    private(set) var expire: (@MainActor @Sendable () -> Void)?
    private(set) var ended: [UIBackgroundTaskIdentifier] = []

    init(granting granted: UIBackgroundTaskIdentifier = UIBackgroundTaskIdentifier(rawValue: 7)) {
        self.granted = granted
    }

    func begin(
        _ expiration: @escaping @MainActor @Sendable () -> Void
    ) -> UIBackgroundTaskIdentifier {
        expire = expiration
        return granted
    }

    func end(_ identifier: UIBackgroundTaskIdentifier) {
        ended.append(identifier)
    }
}

/// Work that runs until `finish()`.
@MainActor
private final class HeldWork {
    private let finished: AsyncStream<Void>
    private let finish: AsyncStream<Void>.Continuation
    private(set) var ran = false

    init() {
        (finished, finish) = AsyncStream.makeStream()
    }

    func run() async {
        ran = true
        for await _ in finished {}
    }

    func complete() {
        finish.finish()
    }
}

@Suite("Background execution assertion")
@MainActor
internal struct BackgroundExecutionAssertionTests {
    @Test("the assertion is held while the work runs and ended once it returns")
    func endsWhenTheWorkReturns() async {
        let application = FakeApplication()
        let work = HeldWork()

        let task = BackgroundExecutionAssertion.hold(
            begin: application.begin, end: application.end, while: work.run)
        await Task.yield()
        #expect(application.ended.isEmpty)

        work.complete()
        await task.value

        #expect(work.ran)
        #expect(application.ended == [application.granted])
    }

    @Test("expiry ends the assertion, and the work returning later does not end it again")
    func expiryEndsItOnce() async {
        let application = FakeApplication()
        let work = HeldWork()

        let task = BackgroundExecutionAssertion.hold(
            begin: application.begin, end: application.end, while: work.run)
        application.expire?()
        #expect(application.ended == [application.granted])

        work.complete()
        await task.value

        #expect(application.ended == [application.granted])
    }

    @Test("a refused assertion still runs the work and ends nothing")
    func refusedStillRuns() async {
        let application = FakeApplication(granting: .invalid)
        let work = HeldWork()

        let task = BackgroundExecutionAssertion.hold(
            begin: application.begin, end: application.end, while: work.run)
        work.complete()
        await task.value

        #expect(work.ran)
        #expect(application.ended.isEmpty)
    }
}
