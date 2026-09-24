import AppCore
import AppCoreFakes
import Testing

/// `.receiptCapture` names a capability Purchases reads, not a screen of its
/// own — POPS-4294 removed its tab, and `.receiptCapture` is deliberately
/// absent from every fixture's `renderable` list below, the same way it is
/// absent from `RootFeature.renderable`. What these prove is that the BFM's
/// answer about it still reaches `FeatureSurface.captureAvailable` even
/// though it never reaches `available` and so never earns a tab.
@Suite("App shell capture availability")
@MainActor
internal struct AppShellCaptureAvailabilityTests {
    private let device = PairedDevice.fake()

    @Test("capture is available when the BFM says receipt-capture is usable, and it is not a tab")
    func captureAvailableWhenBFMSaysSo() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [
                        .fake(id: .purchases, reachability: .healthy),
                        .fake(id: .receiptCapture, reachability: .healthy),
                    ]))
            ),
            renderable: [.purchases]
        )

        await fixture.launch()

        #expect(fixture.surface?.captureAvailable == true)
        #expect(fixture.surface?.available == [.purchases])
    }

    @Test("capture is unavailable when the BFM does not name receipt-capture at all")
    func captureUnavailableWhenBFMOmitsIt() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(.fake(features: [.fake(id: .purchases, reachability: .healthy)]))
            ),
            renderable: [.purchases]
        )

        await fixture.launch()

        #expect(fixture.surface?.captureAvailable == false)
    }

    @Test("capture is unavailable when the BFM reports receipt-capture as unreachable")
    func captureUnavailableWhenBFMSaysUnreachable() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [
                        .fake(id: .purchases, reachability: .healthy),
                        .fake(id: .receiptCapture, reachability: .unavailable),
                    ]))
            ),
            renderable: [.purchases]
        )

        await fixture.launch()

        #expect(fixture.surface?.captureAvailable == false)
    }

    /// The BFM naming only `.receiptCapture` is a build with nothing to draw:
    /// `.receiptCapture` is not in any fixture's `renderable` list, the same
    /// way it is absent from `RootFeature.renderable`, so it never becomes
    /// `available` and never earns a screen — Purchases' own tab is what
    /// would offer it, and Purchases is not among the features named here.
    @Test("receipt-capture named alone leaves nothing available, though capture itself reads true")
    func receiptCaptureAloneIsNothingAvailable() async {
        let fixture = AppShellFixture(
            restored: .paired(device),
            bootstrap: FakeBootstrapService(
                result: .success(
                    .fake(features: [.fake(id: .receiptCapture, reachability: .healthy)]))
            ),
            renderable: [.purchases]
        )

        await fixture.launch()

        #expect(fixture.surface?.available.isEmpty == true)
        #expect(fixture.surface?.captureAvailable == true)
    }
}
