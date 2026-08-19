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
/// `ImageRenderer` lays a `ScrollView` out but rasterises none of its content
/// — confirmed independently on the host toolchain and the iPhone Simulator,
/// at any nesting depth — so a pixel assertion cannot see inside the form.
/// Comparing rendered *height at an unconstrained proposal* does not
/// substitute for that either: asked for its ideal height, a plain `VStack`
/// grows with the text exactly as a `ScrollView` does, so that comparison
/// stays green even with the `ScrollView` deleted outright.
///
/// What actually distinguishes the two is what happens when the space they
/// are given is *smaller* than their content. A `ScrollView` always reports
/// back the height it was proposed — that is the definition of "scrolls":
/// the overflow is clipped to the viewport and reached by scrolling. A
/// non-scrolling stack reports its full ideal height regardless of the
/// proposal, overflowing the frame with no way to reach what spilled out. So
/// this renders at a real device's height rather than an unconstrained one,
/// and checks that the form does not exceed it.
///
/// Measured on the iPhone 17 Simulator when this landed: at an unconstrained
/// height the form is 320×485 at `.large` and 320×1397 at `.accessibility5`
/// — comfortably over the 667pt bound used below, which is why
/// `.accessibility5` is the size this test needs.
///
/// iOS only, and the conditional is the honest kind: macOS has no Dynamic
/// Type, so `.environment(\.dynamicTypeSize, ...)` does not change the text
/// size the host toolchain lays out, and `.large` and `.accessibility5`
/// rasterise to the same height there — this suite is not answering a
/// question the host toolchain can ask.
#if os(iOS)
    @Suite("Pairing under Dynamic Type")
    @MainActor
    internal struct PairingDynamicTypeTests {
        /// The same 320pt canvas the other rendering suites use, and the hardest
        /// case rather than a typical one: a narrower screen wraps more text, so it
        /// reaches the overflow this test looks for sooner than a current handset's
        /// width would. Fixed so the only variable between the two renders is the
        /// text size.
        private static let width: CGFloat = 320

        /// The point height of an iPhone SE (3rd generation) — the shortest
        /// screen iOS still ships a current device on, and the tightest fit this
        /// form has to survive without stranding the Pair button off-screen.
        private static let deviceHeight: CGFloat = 667

        private static func renderedHeight(at size: DynamicTypeSize, proposedHeight: CGFloat)
            -> Int?
        {
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
            // `.frame(width:height:)` would *force* the rendered size to exactly
            // this value regardless of content, which would make the assertion
            // below true of a VStack just as much as a ScrollView and prove
            // nothing. Proposing the height here instead of fixing it in the
            // view hierarchy is what lets a ScrollView and a non-scrolling stack
            // answer differently: a ScrollView reports back the size it was
            // proposed, a VStack reports its own ideal size regardless of it.
            renderer.proposedSize = ProposedViewSize(width: width, height: proposedHeight)
            return renderer.cgImage?.height
        }

        @Test("the form stays within the device height instead of overflowing it")
        func accessibilitySizeStaysWithinDeviceHeight() throws {
            let rendered = try #require(
                Self.renderedHeight(at: .accessibility5, proposedHeight: Self.deviceHeight),
                "the pairing screen failed to rasterise at .accessibility5")

            // Non-empty first. A renderer that produced a zero-height image would
            // satisfy nothing below it and would read as a clean pass.
            try #require(rendered > 0, "the pairing screen rasterised to zero height")

            #expect(
                rendered <= Int(Self.deviceHeight),
                """
                the pairing screen rendered \(rendered)pt tall inside a \
                \(Int(Self.deviceHeight))pt viewport — a ScrollView always reports back \
                the height it was proposed, so this overflow means the form stopped \
                scrolling and started clipping past the edge of the screen instead
                """)
        }
    }
#endif
