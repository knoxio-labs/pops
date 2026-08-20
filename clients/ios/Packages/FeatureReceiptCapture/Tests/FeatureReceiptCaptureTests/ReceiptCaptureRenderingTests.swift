import AppCore
import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture

/// The capture screen actually draws, and draws differently when the states it
/// is supposed to distinguish differ.
///
/// Same technique and the same reasoning as `ReceiptResultRenderingTests` next
/// door: the `#Preview`s claim these render, Xcode's canvas is the only place a
/// person sees that, and nothing in CI opens it.
///
/// This renders `ReceiptCapturePrompt`, not `ReceiptCaptureView`, and that is a
/// measurement rather than a preference. `ImageRenderer` lays a `ScrollView`
/// out — the image comes back at the content's own height — and rasterises
/// none of what is inside it: a screenful of copy produced an empty canvas on
/// the host toolchain and on the iPhone 17 Simulator alike. Rendering the
/// screen itself would therefore compare blank against blank and pass whatever
/// the copy said. ``ReceiptCaptureLayoutTests`` below covers the scrolling from
/// the other end, the way `PairingDynamicTypeTests` does.
///
/// Every comparison that depends on one state being a *different colour* from
/// another carries `.requiresCompiledColorCatalog`, for the reason
/// `HostToolchainColorSupport` documents and `ReceiptResultRenderingTests`
/// next door already applies: where the build system copies
/// `Colors.xcassets` without compiling it, every `Color.pops*` token resolves
/// to the same placeholder, so the copy is drawn in the background's own
/// colour and every one of these screens rasterises to a bare canvas —
/// identical to each other and identical in both schemes. That is the
/// renderer having nothing to say, not the screens being the same, and the
/// two must not be reported alike. What survives on that lane is what does not
/// need a colour: determinism, and `ReceiptCaptureLayoutTests`' heights.
/// ``CameraRefusalTests`` covers the refusals' substance there instead.
@Suite("Receipt capture rendering")
@MainActor
internal struct ReceiptCaptureRenderingTests {
    /// The 320pt canvas the other rendering suites use, and the harder case: a
    /// narrower screen wraps more copy, so a layout that clips reaches it
    /// sooner than a current handset's width would.
    private static let canvas = CGSize(width: 320, height: 700)

    private static func prompt(
        access: CameraAccess,
        problem: ReceiptCaptureProblem? = nil
    ) -> ReceiptCapturePrompt {
        ReceiptCapturePrompt(model: ReceiptCaptureFixture.model(access: access, problem: problem))
    }

    private static func render(
        _ view: some View,
        in scheme: ColorScheme = .light,
        size: DynamicTypeSize = .large
    ) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.colorScheme, scheme)
                .environment(\.dynamicTypeSize, size)
                .frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("the capture prompt rasterises")
    func thePromptRasterises() throws {
        _ = try #require(Self.render(Self.prompt(access: .authorized)))
    }

    /// Gated, because where no token resolves both renders are the same blank
    /// canvas and match whether the prompt is deterministic or not — which is
    /// why the rasterisation claim above is a test of its own.
    @Test("the capture prompt renders the same way twice", .requiresCompiledColorCatalog)
    func rendersDeterministically() throws {
        let once = try #require(Self.render(Self.prompt(access: .authorized)))
        let again = try #require(Self.render(Self.prompt(access: .authorized)))

        #expect(once == again)
    }

    /// The canvas is not blank. Every comparison below is between two renders
    /// of the same view, and two empty canvases satisfy none of them — but a
    /// suite that never checked would not say so, which is precisely how the
    /// screen-level version of this test passed while drawing nothing.
    @Test("the prompt draws something rather than an empty canvas", .requiresCompiledColorCatalog)
    func theCanvasIsNotEmpty() throws {
        let drawn = try #require(Self.render(Self.prompt(access: .authorized)))
        let blank = try #require(Self.render(Color.popsBackground))

        #expect(drawn != blank, "the capture prompt rasterised to bare background")
    }

    /// The four camera answers are four different screens, not one screen with
    /// a different sentence somewhere off-canvas.
    ///
    /// Only that they differ. Which of them offers the Settings link is not
    /// something this can see — the refusals differ by copy whether the link
    /// is there or not, so every comparison here passes either way.
    /// ``CameraRefusalTests`` is what holds that rule.
    @Test(
        "each camera refusal draws differently from the offer and from the others",
        .requiresCompiledColorCatalog)
    func everyRefusalLooksDifferent() throws {
        let offered = try #require(Self.render(Self.prompt(access: .authorized)))
        let denied = try #require(Self.render(Self.prompt(access: .denied)))
        let restricted = try #require(Self.render(Self.prompt(access: .restricted)))
        let unavailable = try #require(Self.render(Self.prompt(access: .unavailable)))

        #expect(offered != denied)
        #expect(denied != restricted)
        #expect(denied != unavailable)
        #expect(restricted != unavailable)
    }

    /// What a Simulator — and any UI flow hosted on one — actually meets.
    /// `AppCore`'s own Simulator suite asserts the camera reports `.unavailable`
    /// there, and this is the other end of it: that state is a drawn screen
    /// with content, not a blank one and not a camera showing black.
    @Test(
        "the no-camera state is a real screen rather than an empty one",
        .requiresCompiledColorCatalog)
    func theNoCameraStateDrawsSomething() throws {
        let blank = try #require(Self.render(Color.popsBackground))
        let unavailable = try #require(Self.render(Self.prompt(access: .unavailable)))
        let light = try #require(Self.render(Self.prompt(access: .unavailable), in: .light))
        let dark = try #require(Self.render(Self.prompt(access: .unavailable), in: .dark))

        #expect(unavailable != blank)
        #expect(light != dark, "the no-camera screen renders identically in both colour schemes")
    }

    /// A problem is an extra sentence, and an extra sentence moves the
    /// layout whether or not the copy had a colour to be drawn in — so unlike
    /// its neighbours this one has a real answer on the uncompiled-catalogue
    /// lane and says so rather than staying silent about it.
    @Test(
        "every capture problem reaches the screen",
        .comparisonSurvivesAnUncompiledCatalog,
        arguments: [
            ReceiptCaptureProblem.cameraFailed, .noPages, .unpreparedPages, .tooManyPages(9),
        ])
    func problemsAreDrawn(problem: ReceiptCaptureProblem) throws {
        let clean = try #require(Self.render(Self.prompt(access: .authorized)))
        let complaining = try #require(
            Self.render(Self.prompt(access: .authorized, problem: problem)))

        #expect(clean != complaining, "\(problem) is not drawn on the capture screen")
    }

    /// The four problems say four different things. One sentence covering all
    /// of them would still pass the test above.
    @Test("the problems do not all draw the same sentence", .requiresCompiledColorCatalog)
    func problemsAreDistinct() throws {
        let drawn = try [
            ReceiptCaptureProblem.cameraFailed, .noPages, .unpreparedPages, .tooManyPages(9),
        ].map { try #require(Self.render(Self.prompt(access: .authorized, problem: $0))) }

        #expect(Set(drawn).count == drawn.count)
    }
}

/// The scrolling half, measured the way `PairingDynamicTypeTests` measures the
/// pairing form's — and for the same reason it exists there.
///
/// `ReceiptCaptureView` wraps its prompt in an unconditional `ScrollView`
/// because at accessibility sizes the refusal copy, a problem sentence and a
/// button are taller than a phone, and a fixed layout puts the button
/// off-screen with no way to reach it. What this catches is the regression the
/// reasoning cannot: a layout that stops growing with the text and clips
/// instead. The view is rendered at a fixed WIDTH with its height
/// unconstrained, so the rasterised height is the layout's own answer rather
/// than a canvas size chosen here — which is the one thing `ImageRenderer` does
/// report faithfully about a scroll view.
@Suite("Receipt capture layout")
@MainActor
internal struct ReceiptCaptureLayoutTests {
    private static let width: CGFloat = 320

    private static func height(
        access: CameraAccess,
        problem: ReceiptCaptureProblem? = nil,
        at size: DynamicTypeSize = .large
    ) -> Int? {
        let view = ReceiptCaptureView(
            model: ReceiptCaptureFixture.model(access: access, problem: problem))
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.dynamicTypeSize, size)
                .frame(width: width)
        )
        renderer.scale = 1
        return renderer.cgImage?.height
    }

    #if os(iOS)
        @Test("the screen grows with the text instead of clipping")
        func accessibilitySizeRendersTaller() throws {
            let standard = try #require(
                Self.height(access: .denied), "the capture screen failed to rasterise at .large")
            let accessibility = try #require(
                Self.height(access: .denied, at: .accessibility5),
                "the capture screen failed to rasterise at .accessibility5")

            // Non-empty first. A renderer that produced a zero-height image
            // would satisfy nothing below it and would read as a clean pass.
            try #require(standard > 0, "the capture screen rasterised to zero height at .large")

            #expect(
                accessibility > standard,
                """
                the capture screen is \(accessibility)pt tall at .accessibility5 and \
                \(standard)pt at .large — it is not growing with the text, so its content is \
                being clipped rather than made reachable
                """)
        }
    #endif

    /// A problem is an extra sentence on a screen that was already laid out.
    /// If it did not make the screen taller it is not on it — which is the
    /// half of "the problem is drawn" that survives the scroll view.
    @Test("a capture problem takes up room on the screen it is reported on")
    func aProblemChangesTheLayout() throws {
        let clean = try #require(Self.height(access: .authorized))
        let complaining = try #require(Self.height(access: .authorized, problem: .noPages))

        #expect(complaining > clean)
    }
}

/// One model, built the way the screen's own states are reached.
@MainActor
internal enum ReceiptCaptureFixture {
    internal static func model(
        access: CameraAccess,
        problem: ReceiptCaptureProblem? = nil
    ) -> ReceiptCaptureViewModel {
        let model = ReceiptCaptureViewModel(
            dependencies: .fake(),
            camera: StubCameraAuthorization(standing: access)
        )
        model.refreshCameraAccess()
        if let problem { record(problem, on: model) }
        return model
    }

    /// Driven the way the document camera drives it — a fixture that assigned
    /// the field directly would be asserting about a setter rather than about a
    /// capture, and would keep passing if `didCapture` stopped reporting
    /// anything.
    private static func record(_ problem: ReceiptCaptureProblem, on model: ReceiptCaptureViewModel)
    {
        switch problem {
        case .cameraFailed:
            model.didFailCapture()
        case .noPages:
            model.didCapture([], from: 0)
        case .unpreparedPages:
            model.didCapture([], from: 2)
        case .tooManyPages(let count):
            model.didCapture(
                (0..<count).map { ReceiptPart(mediaType: .jpeg, data: Data("\($0)".utf8)) },
                from: count)
        }
        precondition(
            model.problem == problem,
            "the fixture asked for \(problem) and the model recorded "
                + "\(String(describing: model.problem))")
    }
}
