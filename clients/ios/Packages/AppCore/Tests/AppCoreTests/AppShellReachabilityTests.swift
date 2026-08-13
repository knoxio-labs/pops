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
        // ``noteReachable()`` returning means it has. Waits for the fake's
        // SECOND call to actually finish (not merely start — see
        // ``FakeBootstrapService/waitForCompletions(atLeast:)``), signalled
        // rather than polled, and raced against a deadline so a regression
        // fails this test instead of hanging the suite.
        let landed = await withDeadline(seconds: 5) {
            await bootstrap.waitForCompletions(atLeast: 2)
        }

        #expect(landed)
        #expect(fixture.surface?.bootstrap == .answered(.fresh))
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

    /// Returns `true` if `operation` finishes within `seconds`, `false` if the
    /// deadline wins first.
    ///
    /// Every wait this races is signalled exactly — see
    /// ``FakeBootstrapService/waitForCompletions(atLeast:)`` — so a correct
    /// implementation resolves in milliseconds; `seconds` only needs to be far
    /// past that. It exists to turn "the retry this test waits for never
    /// landed" into a fast, clear failure instead of a suite that hangs until
    /// CI kills the job. Mirrors `withDeadline` in `AuthTests/
    /// ConcurrencyProbes.swift` — not shared, because nothing here crosses
    /// that package boundary yet for one caller to justify it (and `AppCore`
    /// sits upstream of `Auth` in the dependency graph, so it could not
    /// depend on `Auth`'s test target even if it wanted to).
    private func withDeadline(
        seconds: Double,
        _ operation: @Sendable @escaping () async -> Void
    ) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                await operation()
                return true
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(seconds))
                return false
            }
            defer { group.cancelAll() }
            return await group.next() ?? false
        }
    }
}
