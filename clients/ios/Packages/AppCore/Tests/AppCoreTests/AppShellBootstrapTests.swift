import AppCore
import AppCoreFakes
import Testing

/// What the app shows is what the BFM said, and what it does when the BFM says
/// nothing at all.
@Suite("App shell bootstrap")
@MainActor
internal struct AppShellBootstrapTests {
    private let device = PairedDevice.fake()

    /// The acceptance criterion: no feature list is compiled in. This build can
    /// draw transactions and would like to; the server says the pillar behind
    /// it is not answering, and the surface reflects that rather than the
    /// build's own opinion.
    @Test(
        "a feature the BFM reports as unusable is not offered",
        arguments: [FeatureReachability.unavailable, .contractMismatch]
    )
    func unusableFeatureIsWithheld(reachability: FeatureReachability) async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(features: [.fake(reachability: reachability)]))
            )
        )

        await fixture.launch()

        #expect(fixture.surface?.available == [])
        #expect(
            fixture.surface?.unavailable == [
                FeatureAvailability(id: .transactions, reachability: reachability)
            ]
        )
    }

    /// The distinction the BFM keeps is kept here. Collapsing them would leave
    /// the screen unable to say which of the two things happened, which is the
    /// only time this response is worth having.
    @Test("unavailable and contract-mismatch are not the same withheld feature")
    func withheldReasonsStaySeparate() async {
        let down = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(features: [.fake(reachability: .unavailable)]))
            )
        )
        let mismatched = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(features: [.fake(reachability: .contractMismatch)]))
            )
        )

        await down.launch()
        await mismatched.launch()

        #expect(down.surface?.unavailable != mismatched.surface?.unavailable)
    }

    @Test(
        "a feature the BFM reports as working is offered",
        arguments: [FeatureReachability.healthy, .degraded]
    )
    func usableFeatureIsOffered(reachability: FeatureReachability) async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(features: [.fake(reachability: reachability)]))
            )
        )

        await fixture.launch()

        #expect(fixture.surface?.available == [.transactions])
        #expect(fixture.surface?.unavailable.isEmpty == true)
    }

    /// A build already on a phone meets a BFM that has learned new words. The
    /// unknown state is treated as working, because hiding a screen on a word
    /// this build cannot read is the worse of the two mistakes.
    @Test("a reachability state written after this build shipped does not hide a feature")
    func unknownReachabilityIsUsable() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [.fake(reachability: FeatureReachability(rawValue: "warming"))])
                )
            )
        )

        await fixture.launch()

        #expect(fixture.surface?.available == [.transactions])
    }

    /// The other half of the same problem: a feature id this build has never
    /// heard of cannot be drawn, so it is skipped rather than reported as
    /// something the user is missing out on.
    @Test("a feature this build cannot draw is skipped, not reported as unavailable")
    func unknownFeatureIsSkipped() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [
                        .fake(id: MobileFeature(rawValue: "budgets")),
                        .fake(),
                    ])
                )
            )
        )

        await fixture.launch()

        #expect(fixture.surface?.available == [.transactions])
        #expect(fixture.surface?.unavailable.isEmpty == true)
    }

    /// Order is the server's. A build that sorted them would be making a
    /// product decision in a binary nobody can update.
    @Test("features are offered in the order the BFM named them")
    func serverOrderIsPreserved() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [
                        .fake(id: MobileFeature(rawValue: "budgets")),
                        .fake(),
                    ])
                )
            ),
            renderable: [.transactions, MobileFeature(rawValue: "budgets")]
        )

        await fixture.launch()

        #expect(fixture.surface?.available == [MobileFeature(rawValue: "budgets"), .transactions])
    }

    @Test("a BFM that names nothing this build can draw is a state, not an error")
    func nothingAvailable() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(result: .success(.fake(features: [])))
        )

        await fixture.launch()

        #expect(fixture.surface?.available.isEmpty == true)
        #expect(fixture.surface?.bootstrap.isDegraded == false)
    }

    @Test("the BFM is asked once per device, however often the view asks")
    func bootstrapRunsOncePerDevice() async {
        let fixture = AppShellFixture(restored: .paired(device))

        await fixture.launch()
        await fixture.model.loadBootstrap()
        await fixture.model.loadBootstrap()

        #expect(await fixture.bootstrap.callCount == 1)
    }

    @Test("pairing to a different device asks again")
    func repairingAsksAgain() async {
        let fixture = AppShellFixture(restored: .paired(device))
        await fixture.launch()

        fixture.session.send(.paired(.fake(id: "device-2")))
        await fixture.model.loadBootstrap()

        #expect(await fixture.bootstrap.callCount == 2)
    }

    @Test("an unpaired app asks nobody anything")
    func unpairedDoesNotBootstrap() async {
        let fixture = AppShellFixture()

        await fixture.launch()

        #expect(await fixture.bootstrap.callCount == 0)
    }
}
