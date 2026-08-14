import AppCore
import AppCoreFakes
import Testing

/// What the app does when it cannot find out what it should be doing.
///
/// The rule underneath every case here: an app that will not open because a
/// status call failed is worse than one that opens slightly wrong.
@Suite("App shell degradation")
@MainActor
internal struct AppShellDegradationTests {
    private let device = PairedDevice.fake()

    private func failing(_ error: RepositoryError) -> FakeBootstrapService {
        FakeBootstrapService(result: .failure(error))
    }

    @Test(
        "a bootstrap that fails still opens the app on what this build can draw",
        arguments: [
            RepositoryError.unavailable, .contractMismatch, .transport("dead"), .unauthorized,
        ]
    )
    func failureDegradesRatherThanBlocking(error: RepositoryError) async {
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: failing(error))

        await fixture.launch()

        #expect(fixture.surface?.available == [.transactions])
        #expect(fixture.surface?.bootstrap == .failed(error))
        #expect(fixture.surface?.bootstrap.isDegraded == true)
    }

    /// The app is on screen and usable before the answer arrives, which is what
    /// stops a slow status call from being a slow launch. Nothing apologises
    /// during that window — there is nothing to apologise for yet.
    @Test("the app is usable while the BFM is still being asked")
    func contentIsShownWhileBootstrapIsInFlight() async {
        let bootstrap = FakeBootstrapService()
        await bootstrap.suspendUntilReleased()
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.model.restoreSession()

        async let pending: Void = fixture.model.loadBootstrap()

        #expect(fixture.surface?.available == [.transactions])
        #expect(fixture.surface?.bootstrap == .pending)
        #expect(fixture.surface?.bootstrap.isDegraded == false)

        await bootstrap.release()
        await pending
    }

    /// A registry the BFM could not reach is not the same as a pillar that is
    /// down: the features it named may be right, they are just not current. The
    /// app says so rather than hiding anything.
    @Test(
        "an answer built from a registry the BFM could not reach is flagged as degraded",
        arguments: [RegistrySource.staleFallback, .unavailable]
    )
    func staleRegistryIsDegraded(source: RegistrySource) async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(result: .success(.fake(registrySource: source)))
        )

        await fixture.launch()

        #expect(fixture.surface?.bootstrap.isDegraded == true)
        #expect(fixture.surface?.available == [.transactions])
    }

    @Test(
        "a registry read the BFM completed is not an apology",
        arguments: [RegistrySource.fresh, .cached]
    )
    func currentRegistryIsNotDegraded(source: RegistrySource) async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(result: .success(.fake(registrySource: source)))
        )

        await fixture.launch()

        #expect(fixture.surface?.bootstrap.isDegraded == false)
    }

    /// A registry source written after this build shipped is treated as a
    /// degradation, which is the opposite of how an unknown *reachability* is
    /// treated — and deliberately so. Being unsure about how current the answer
    /// is costs one line of explanation; being unsure whether a screen works
    /// costs the screen.
    @Test("a registry source this build cannot read is treated as not current")
    func unknownRegistrySourceIsDegraded() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(registrySource: RegistrySource(rawValue: "rebuilding")))
            )
        )

        await fixture.launch()

        #expect(fixture.surface?.bootstrap.isDegraded == true)
    }

    @Test("retrying a failed bootstrap adopts the answer")
    func retrySucceeds() async {
        let bootstrap = failing(.unavailable)
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.launch()

        await bootstrap.setResult(
            .success(.fake(features: [.fake(reachability: .unavailable)]))
        )
        await fixture.model.reloadBootstrap()

        #expect(fixture.surface?.available.isEmpty == true)
        #expect(fixture.surface?.bootstrap == .answered(.fresh))
    }

    /// The dead end this exists to prevent: a BFM that reported every feature
    /// unavailable leaves a screen with nothing on it, and nothing on that
    /// screen makes a request — so the pillar coming back is not something the
    /// app can find out by waiting. Without a way to ask again, recovering
    /// means force-quitting.
    @Test("a surface with nothing on it can ask again, and adopts the better answer")
    func nothingAvailableCanRecover() async {
        let bootstrap = FakeBootstrapService(
            result: .success(.fake(features: [.fake(reachability: .unavailable)]))
        )
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.launch()
        #expect(fixture.surface?.available.isEmpty == true)

        await bootstrap.setResult(.success(.fake()))
        await fixture.model.reloadBootstrap()

        #expect(fixture.surface?.available == [.transactions])
    }

    /// Returning to the app is the one moment worth asking again. A reload
    /// after a successful answer keeps that answer on screen while the next
    /// one is in flight, rather than flickering the whole surface back to this
    /// build's guess.
    @Test("asking again after a good answer keeps it until a better one arrives")
    func reloadKeepsTheLastAnswer() async {
        let bootstrap = FakeBootstrapService(
            result: .success(.fake(features: [.fake(reachability: .unavailable)]))
        )
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.launch()
        await bootstrap.suspendUntilReleased()

        async let pending: Void = fixture.model.reloadBootstrap()

        #expect(fixture.surface?.available.isEmpty == true)
        #expect(fixture.surface?.bootstrap == .answered(.fresh))

        await bootstrap.release()
        await pending
    }

    /// A cancelled call answered nothing, so it must not count as having asked.
    /// `.task(id:)` is cancelled by any change of session, so a revocation
    /// landing mid-flight and a re-pair to the same device is a reachable way
    /// to strand the surface on this build's guess for the rest of the launch.
    @Test("a cancelled ask is not remembered as having been asked")
    func cancellationDoesNotBlockALaterAsk() async throws {
        let bootstrap = FakeBootstrapService()
        await bootstrap.suspendUntilReleased()
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.model.restoreSession()

        let abandoned = Task { await fixture.model.loadBootstrap() }
        try await bootstrap.waitUntilCalled()
        abandoned.cancel()
        await bootstrap.release()
        await abandoned.value

        #expect(fixture.surface?.bootstrap == .pending)

        await fixture.model.loadBootstrap()

        #expect(await fixture.bootstrap.callCount == 2)
        #expect(fixture.surface?.bootstrap == .answered(.fresh))
    }

    @Test("an unpaired app has nothing to ask about")
    func reloadDoesNothingWhenUnpaired() async {
        let fixture = AppShellFixture()
        await fixture.launch()

        await fixture.model.reloadBootstrap()

        #expect(await fixture.bootstrap.callCount == 0)
    }

    /// An answer that lands after the device it was asked about is gone must
    /// not decide what the next device shows.
    @Test("an answer for a device the app is no longer on is discarded")
    func staleAnswerIsDiscarded() async {
        let bootstrap = FakeBootstrapService(
            result: .success(.fake(features: [.fake(reachability: .unavailable)]))
        )
        await bootstrap.suspendUntilReleased()
        let fixture = AppShellFixture(restored: .paired(device), bootstrap: bootstrap)
        await fixture.model.restoreSession()

        async let pending: Void = fixture.model.loadBootstrap()
        fixture.session.send(.revoked(.revokedByOperator))
        await bootstrap.release()
        await pending

        #expect(fixture.destination == .pairing(.revokedByOperator))
        fixture.session.send(.paired(device))
        #expect(fixture.surface?.available == [.transactions])
    }
}
