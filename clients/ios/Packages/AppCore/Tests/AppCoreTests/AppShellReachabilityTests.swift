import AppCore
import AppCoreFakes
import Testing

/// ``AppShellModel/noteReachable()`` — the retry a feature's own successful
/// request can trigger, distinct from the "person returned to the app or
/// tapped retry" paths ``AppShellDegradationTests`` covers.
@Suite("App shell reachability")
@MainActor
internal struct AppShellReachabilityTests {
    private let device = PairedDevice.fake()

    @Test("evidence of reachability retries a failed bootstrap")
    func evidenceRetriesAFailure() async {
        let bootstrap = FakeBootstrapService(result: .failure(.unavailable))
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.launch()
        #expect(fixture.surface?.bootstrap.isDegraded == true)

        await bootstrap.setResult(.success(.fake()))
        await fixture.model.noteReachable()

        // ``noteReachable()`` starts the retry without awaiting it — the
        // whole point being tested elsewhere is that a caller's own
        // completion never depends on this finishing — so the assertion has
        // to wait for the retry to actually land rather than assume
        // ``noteReachable()`` returning means it has. Bounded so a regression
        // fails this test instead of hanging the suite.
        let landed = await waitUntil { fixture.surface?.bootstrap == .answered(.fresh) }

        #expect(landed)
        #expect(await fixture.bootstrap.callCount == 2)
    }

    /// Nothing to retry: a pending bootstrap is already in flight or about to
    /// be, and asking again on top of it would be a second call for the same
    /// answer rather than a recovery from anything.
    @Test("evidence of reachability does nothing while bootstrap is pending")
    func evidenceDoesNothingWhilePending() async {
        let bootstrap = FakeBootstrapService()
        await bootstrap.suspendUntilReleased()
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.model.restoreSession()

        async let pending: Void = fixture.model.loadBootstrap()
        await bootstrap.waitUntilCalled()
        await fixture.model.noteReachable()

        #expect(await fixture.bootstrap.callCount == 1)

        await bootstrap.release()
        await pending
    }

    /// An answered bootstrap already has a better thing on screen than
    /// whatever a re-ask driven by an unrelated feature succeeding would
    /// produce — the registry snapshot isn't more current for a transactions
    /// page having loaded.
    @Test("evidence of reachability does nothing once bootstrap has answered")
    func evidenceDoesNothingOnceAnswered() async {
        let bootstrap = FakeBootstrapService(result: .success(.fake()))
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.launch()

        await fixture.model.noteReachable()

        #expect(await fixture.bootstrap.callCount == 1)
    }

    /// Yields until `condition` holds, and reports whether it ever did.
    ///
    /// Cooperative yielding rather than a sleep: the ``noteReachable()`` Task
    /// under test runs on this same actor, so yielding is what lets it run,
    /// and the wait ends the instant the condition holds rather than after a
    /// duration somebody guessed. The bound is a yield count, not wall-clock
    /// time, so a regression fails this test instead of hanging the suite,
    /// and nothing about it is timing dependent. Mirrors `AuthTests`'
    /// `waitUntil` — not shared, because nothing here crosses that module
    /// boundary yet for one caller to justify it.
    @discardableResult
    private func waitUntil(_ condition: () -> Bool) async -> Bool {
        for _ in 0..<10_000 {
            if condition() { return true }
            await Task.yield()
        }
        return false
    }
}
