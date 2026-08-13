import AppCore
import Auth
import FeatureReceiptCapture
import Foundation
import SwiftUI
import Testing

@testable import Pops

/// The bug this covers only exists when the BFM names more than one feature,
/// and today it never does — so a test that only ever built a
/// single-`available` `FeatureSurface` would reproduce the exact blind spot
/// that let `ContentView` ship reading `.first`.
///
/// Lives here rather than in a package because `ContentView` is under `App/`,
/// which is in no package — see `AppTests/README.md`.
///
/// ## Why this renders `.receiptCapture` and never `.transactions`
///
/// `TransactionsFlowView` is the one screen this suite must not construct.
/// Rendering it through `ImageRenderer` — even indirectly, through
/// `ContentView` — crashes the host process outright:
/// `SwiftUICore/Logging.swift:232: Fatal error: no current update to enqueue
/// action to`, from the list's `.task` starting real async work outside a
/// SwiftUI transaction `ImageRenderer` never opens. That is the same
/// limitation `TransactionDetailRenderingTests` documents and works around by
/// rendering `TransactionDetailCard` rather than the screen it sits in;
/// `ReceiptCaptureView` is this suite's equivalent safe substitute — a real
/// production screen with no task and no observable model, so what it proves
/// about `ContentView`'s single-feature path generalises.
///
/// ## Why two-or-more features are not rendered at all
///
/// Measured, not assumed, the same way: an `ImageRenderer` asked to flatten
/// the `TabView` branch logs `Unable to render flattened version of
/// PlatformViewControllerRepresentableAdaptor<UIKitAdaptableTabView>` and
/// produces nothing a byte comparison could tell apart. See
/// ``ContentViewFeatureSwitchingWiringTests`` for how that case is covered
/// instead.
@Suite("ContentView feature switching")
@MainActor
internal struct ContentViewFeatureSwitchingTests {
    private static let canvas = CGSize(width: 390, height: 844)

    private static func render(_ view: some View, in scheme: ColorScheme = .light) -> Data? {
        let renderer = ImageRenderer(
            content: view.environment(\.colorScheme, scheme).frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    /// Its own Keychain service and defaults suite, so a run cannot disturb a
    /// genuinely paired app on the same device — same reasoning as
    /// `CompositionRootTests`.
    private static let namespace = "com.knoxiolabs.pops.tests.content-view-switching"

    private func composition() -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            )
        )
    }

    private func surface(available: [MobileFeature]) -> FeatureSurface {
        FeatureSurface(available: available, unavailable: [], bootstrap: .answered(.fresh))
    }

    private func contentView(available: [MobileFeature]) -> ContentView {
        let bound = composition()
        return ContentView(surface: surface(available: available), shell: bound.shell, composition: bound)
    }

    @Test("zero available features renders, and renders real content rather than a blank screen")
    func zeroFeaturesRendersRealContent() throws {
        let light = try #require(Self.render(contentView(available: []), in: .light))
        let dark = try #require(Self.render(contentView(available: []), in: .dark))

        #expect(light != dark, "the explanation renders identically in both colour schemes")
    }

    @Test("exactly one feature fills the screen, matching the shipped single-feature look")
    func oneFeatureMatchesTheBareScreen() throws {
        let throughContentView = try #require(
            Self.render(contentView(available: [.receiptCapture])))
        let bareScreen = try #require(Self.render(ReceiptCaptureView()))

        #expect(
            throughContentView == bareScreen,
            Comment(
                rawValue: "a single available feature is drawing something other than its own screen "
                    + "outright — this is the regression the ticket calls out: a tab bar appearing "
                    + "for one feature"
            )
        )
    }

    @Test("zero features does not look like one feature")
    func zeroFeaturesDoesNotLookLikeOneFeature() throws {
        let zero = try #require(Self.render(contentView(available: [])))
        let one = try #require(Self.render(contentView(available: [.receiptCapture])))

        #expect(zero != one)
    }
}

/// The half of `ContentView`'s feature-count switch a type checker cannot
/// hold: that the single-feature branch draws that feature outright with no
/// extra chrome, and that the multi-feature branch visits every element of
/// `surface.available`, not just the first. Same technique
/// `TransactionsScreenBoundaryTests` uses for its own routing table, and for
/// the same reason a rendered proof does not exist for the multi-feature half
/// — see ``ContentViewFeatureSwitchingTests``'s doc comment for why.
@Suite("ContentView feature switching wiring")
internal struct ContentViewFeatureSwitchingWiringTests {
    /// `.../AppTests/ContentViewFeatureSwitchingTests.swift`
    private static let contentViewSource: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "App/ContentView.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    /// The scan finds a real file with real content, or every assertion below
    /// holds just as well for a tree where `ContentView.swift` was deleted.
    @Test("the scan is reading ContentView's actual source")
    func scanIsWiredUp() {
        #expect(!Self.contentViewSource.isEmpty, "App/ContentView.swift is empty or missing")
    }

    @Test("exactly one feature draws it directly, with no tab chrome")
    func oneFeatureHasNoWrapper() {
        #expect(
            Self.contentViewSource.contains("screen(for: surface.available[0])"),
            "the single-feature branch no longer draws that feature outright"
        )
    }

    @Test("two or more features are drawn by iterating the whole list, not the first one")
    func multipleFeaturesIterateTheWholeList() {
        #expect(
            Self.contentViewSource.contains("ForEach(surface.available"),
            "the multi-feature branch no longer iterates surface.available"
        )
        #expect(
            !Self.contentViewSource.contains("surface.available.first"),
            "surface.available.first is back — this is the exact regression POPS-1985 fixed"
        )
    }

    @Test("every screen in the switcher still goes through screen(for:)")
    func theSwitcherStillNamesTheOneScreenTable() {
        // `screen(for:)` is the one place a feature id becomes a view. A
        // switcher that built a view another way would draw *something* for a
        // second feature — this repo's whole point — while quietly forking the
        // id-to-screen mapping this file's own doc comment says lives in one
        // place.
        #expect(Self.contentViewSource.contains("screen(for: feature)"))
    }
}
