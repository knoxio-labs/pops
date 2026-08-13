import AppCore
import Auth
import FeatureTransactions
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
/// This rasterises rather than inspects the view tree, the same technique
/// `PrimitiveRenderingTests` and `TransactionDetailRenderingTests` use for the
/// same reason: nothing else in this tree can see what a `body` actually
/// draws. A `TabView`'s off-screen tabs are not part of any single frame, so
/// what a snapshot *can* prove is that the feature shown changes with the
/// list and its order — which is exactly what `.first` could never do, and
/// exactly the shape a regression back to it would take.
@Suite("ContentView feature switching")
@MainActor
internal struct ContentViewFeatureSwitchingTests {
    /// Tall enough to include the tab bar a two-feature surface draws.
    private static let canvas = CGSize(width: 390, height: 844)

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content: view.frame(width: canvas.width, height: canvas.height)
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

    @Test("zero available features shows the explanation, not a blank screen")
    func zeroFeaturesShowsTheExplanation() throws {
        let nothing = try #require(Self.render(contentView(available: [])))
        let one = try #require(Self.render(contentView(available: [.transactions])))

        #expect(nothing != one, "the empty state renders identically to a real feature")
    }

    @Test("exactly one feature fills the screen, matching the shipped single-feature look")
    func oneFeatureMatchesTheBareScreen() throws {
        let throughContentView = try #require(Self.render(contentView(available: [.transactions])))
        let bareScreen = try #require(
            Self.render(TransactionsFlowView(dependencies: .unbound, router: Router())))

        #expect(
            throughContentView == bareScreen,
            Comment(
                rawValue: "a single available feature is drawing something other than its own screen "
                    + "outright — this is the regression the ticket calls out: a tab bar appearing "
                    + "for one feature"
            )
        )
    }

    @Test("two features are each reachable, not just the first")
    func twoFeaturesAreBothReachable() throws {
        let transactionsFirst = try #require(
            Self.render(contentView(available: [.transactions, .receiptCapture])))
        let receiptsFirst = try #require(
            Self.render(contentView(available: [.receiptCapture, .transactions])))
        let transactionsOnly = try #require(Self.render(contentView(available: [.transactions])))

        #expect(
            transactionsFirst != receiptsFirst,
            Comment(
                rawValue: "the BFM's order stopped reaching the switcher — the same two features "
                    + "render identically no matter which one the server named first"
            )
        )
        #expect(
            transactionsFirst != transactionsOnly,
            "a second available feature changed nothing on screen — this is `.first` all over again"
        )
    }

    @Test("three or more features still render, not just two")
    func moreThanTwoFeaturesStillRenders() throws {
        // `MobileFeature` is a raw string wrapper, so a third id this build has
        // no screen for still reaches `ContentView` — it falls to the
        // `unavailableExplanation` case in `screen(for:)`. What this proves is
        // narrower than "reachable": that the switch is over the *whole* list,
        // not capped at two, which a hand-written two-case branch could easily
        // regress to without a test naming three.
        let unknown = MobileFeature(rawValue: "budgets")
        let two = try #require(
            Self.render(contentView(available: [.transactions, .receiptCapture])))
        let three = try #require(
            Self.render(contentView(available: [.transactions, .receiptCapture, unknown])))

        #expect(two != three, "a third available feature did not reach the switcher at all")
    }
}
