import AppCore
import AppCoreFakes
import SwiftUI
import Testing

@testable import FeaturePairing

/// Dynamic Type on the pairing screen, measured rather than reasoned about.
///
/// `PairingView` wraps its form in an unconditional `ScrollView` because at
/// accessibility sizes the content is taller than any iPhone, and a fixed
/// layout puts the Pair button off-screen with no way to reach it. That was a
/// deliberate choice and nothing checked it: the only evidence was a `#Preview`
/// at `.accessibility5`, and a preview is something a person looks at.
///
/// What this catches is the regression the reasoning cannot — a layout that
/// stops growing with the text and clips instead. The view is rendered at a
/// fixed WIDTH with its height unconstrained, so the rasterised height is the
/// layout's own answer to "how tall does this need to be" rather than a canvas
/// size chosen here. A screen that clips reports the same height at both text
/// sizes, which is precisely the failure; a screen that grows reports a larger
/// one.
///
/// Measured on the iPhone 17 Simulator when this landed: 390×485 at `.large`,
/// 390×1230 at `.accessibility5`. The assertion is "strictly taller" rather
/// than any particular ratio — a threshold would be a number nobody could
/// defend, and clipping is what this is looking for.
@Suite("Pairing under Dynamic Type")
@MainActor
internal struct PairingDynamicTypeTests {
    /// The width of the narrowest device this app targets. Fixed so that the
    /// only variable between the two renders below is the text size.
    private static let width: CGFloat = 390

    private static func renderedHeight(at size: DynamicTypeSize) -> Int? {
        let model = PairingViewModel(
            session: SessionStore(),
            dependencies: .fake(pairing: FakeDevicePairingService()),
            camera: StubCameraAuthorization(standing: .authorized),
            device: StubDeviceDescription()
        )
        let renderer = ImageRenderer(
            content: PairingView(model: model)
                .environment(\.dynamicTypeSize, size)
                .frame(width: width)
        )
        renderer.scale = 1
        return renderer.cgImage?.height
    }

    @Test("the form grows with the text instead of clipping")
    func accessibilitySizeRendersTaller() throws {
        let standard = try #require(
            Self.renderedHeight(at: .large), "the pairing screen failed to rasterise at .large")
        let accessibility = try #require(
            Self.renderedHeight(at: .accessibility5),
            "the pairing screen failed to rasterise at .accessibility5")

        // Non-empty first. A renderer that produced a zero-height image would
        // satisfy nothing below it and would read as a clean pass.
        try #require(standard > 0, "the pairing screen rasterised to zero height at .large")

        #expect(
            accessibility > standard,
            """
            the pairing screen is \(accessibility)pt tall at .accessibility5 and \
            \(standard)pt at .large — it is not growing with the text, so its \
            content is being clipped rather than made reachable
            """)
    }
}
