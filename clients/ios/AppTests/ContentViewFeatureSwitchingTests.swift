import AppCore
import Auth
import FeatureReceiptCapture
import Foundation
import SwiftUI
import Testing
import UIKit

@testable import Pops

/// A `ContentView` built the way the app builds it, from a `FeatureSurface`
/// naming what the BFM offered.
///
/// Its own Keychain service and defaults suite, so a run cannot disturb a
/// genuinely paired app on the same device — same reasoning as
/// `CompositionRootTests`.
@MainActor
internal enum ContentViewFixture {
    private static let namespace = "com.knoxiolabs.pops.tests.content-view-switching"

    internal static func view(available: [MobileFeature]) -> ContentView {
        let bound = AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: namespace)
            )
        )
        return ContentView(
            surface: FeatureSurface(
                available: available, unavailable: [], bootstrap: .answered(.fresh)),
            shell: bound.shell,
            composition: bound
        )
    }

    /// The receipt-capture screen as `ContentView` builds it for an unpaired
    /// composition. What it draws does not depend on the repository behind it —
    /// nothing is submitted until a receipt has been photographed — so the
    /// unbound dependencies are the honest ones to render against here.
    internal static func receiptCapture() -> ReceiptCaptureView {
        ReceiptCaptureView(model: ReceiptCaptureViewModel(dependencies: .unbound))
    }
}

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
/// `ReceiptCaptureView` is this suite's equivalent safe substitute. It carries
/// an observable model, but no `.task` and nothing that starts async work to
/// draw itself — its opening state is a camera prompt — so it rasterises the
/// way `PairingView` does, and what it proves about `ContentView`'s
/// single-feature path generalises.
///
/// ## Why two-or-more features are not rendered here
///
/// Measured, not assumed, the same way: an `ImageRenderer` asked to flatten
/// the `TabView` branch logs `Unable to render flattened version of
/// PlatformViewControllerRepresentableAdaptor<UIKitAdaptableTabView>` and
/// produces nothing a byte comparison could tell apart. That branch is mounted
/// in a real window instead — see ``ContentViewTabSwitcherTests``.
@Suite("ContentView feature switching")
@MainActor
internal struct ContentViewFeatureSwitchingTests {
    private static let canvas = CGSize(width: 390, height: 844)

    private static func render(_ view: some View, in scheme: ColorScheme = .light) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.colorScheme, scheme)
                .frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    private func contentView(available: [MobileFeature]) -> ContentView {
        ContentViewFixture.view(available: available)
    }

    @Test("zero available features renders, and renders real content rather than a blank screen")
    func zeroFeaturesRendersRealContent() throws {
        let light = try #require(Self.render(contentView(available: []), in: .light))
        let dark = try #require(Self.render(contentView(available: []), in: .dark))

        #expect(light != dark, "the explanation renders identically in both colour schemes")
    }

    /// What this can and cannot see, since half of it changed under it.
    ///
    /// `ReceiptCaptureView`'s content now sits inside a `ScrollView`, and
    /// `ImageRenderer` lays a scroll view out without rasterising anything in
    /// it — measured, and recorded in `ReceiptCaptureRenderingTests`. So the
    /// pixels compared here are the chrome *around* the feature's screen, not
    /// its interior, and that is precisely the comparison this test is about:
    /// a tab bar, a banner or padding appearing for a single feature all show
    /// up, and a tab bar in particular makes `ImageRenderer` produce nothing at
    /// all, failing the `#require` above the comparison.
    ///
    /// The interior is covered where it can be seen — the feature's own suite —
    /// and the no-tab-bar claim is made from the other end, mounted, in
    /// ``ContentViewTabSwitcherTests``.
    @Test("exactly one feature fills the screen, matching the shipped single-feature look")
    func oneFeatureMatchesTheBareScreen() throws {
        let throughContentView = try #require(
            Self.render(contentView(available: [.receiptCapture])))
        let bareScreen = try #require(Self.render(ContentViewFixture.receiptCapture()))

        #expect(
            throughContentView == bareScreen,
            Comment(
                rawValue: "a single available feature is drawing something other than its own "
                    + "screen outright — this is the regression the ticket calls out: a tab bar "
                    + "appearing for one feature"
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

/// The multi-feature branch, mounted rather than read.
///
/// `ImageRenderer` refuses this branch, so it is proved from the other end:
/// hosted in a window, `TabView` is built by UIKit into a `UITabBarController`,
/// and the tab bar it produces is the list of features a person holding the
/// phone can actually reach. Asserting on that list is what distinguishes
/// "iterates the whole surface" from "draws the first one and stops", which is
/// the whole of the bug — and it is a distinction no assertion about the shape
/// of `ContentView.swift`'s source can make.
///
/// The features are deliberately ones this build has never heard of, bar one:
/// an unknown id maps to no screen, which keeps the whole `TransactionsFlowView`
/// problem described in ``ContentViewFeatureSwitchingTests`` out of a suite that
/// mounts views for real and lets their tasks run.
@Suite("ContentView tab switcher")
@MainActor
internal struct ContentViewTabSwitcherTests {
    private static let canvas = CGSize(width: 390, height: 844)

    /// The titles a person would see along the bottom of the screen.
    private func offeredTabTitles(available: [MobileFeature]) throws -> [String] {
        let switcher = try #require(
            try mountedTabBar(available: available),
            "more than one feature is available and no tab bar was built for them"
        )
        return switcher.tabBar.items?.compactMap(\.title) ?? []
    }

    /// The tab bar the app would actually build for this surface, or `nil` when
    /// it builds none.
    private func mountedTabBar(available: [MobileFeature]) throws -> UITabBarController? {
        let scene = try #require(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "the test host is not showing a window scene, so nothing can be mounted in one"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: Self.canvas)
        window.rootViewController = UIHostingController(
            rootView: ContentViewFixture.view(available: available))
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        defer { window.isHidden = true }

        return Self.tabBarController(in: window.rootViewController)
    }

    /// The named regression, from the end that can see it.
    ///
    /// Its sibling suite proves this by comparing pixels, and can no longer see
    /// inside the feature's own screen — a scroll view does not rasterise. A
    /// tab bar is not inside that screen: it is UIKit chrome around it, and
    /// mounting is what makes its absence a fact rather than an inference from
    /// two canvases that matched.
    @Test("one available feature is offered no tab bar at all")
    func oneFeatureBuildsNoTabBar() throws {
        #expect(
            try mountedTabBar(available: [.receiptCapture]) == nil,
            Comment(
                rawValue: "a tab bar was built for a single feature — one tab is chrome nobody "
                    + "asked for, and it is the regression this suite is named after"
            )
        )
    }

    private static func tabBarController(in controller: UIViewController?) -> UITabBarController? {
        guard let controller else { return nil }
        if let switcher = controller as? UITabBarController { return switcher }
        for child in controller.children {
            if let found = tabBarController(in: child) { return found }
        }
        return nil
    }

    @Test("every available feature is offered, in the BFM's order")
    func everyFeatureGetsATab() throws {
        let available: [MobileFeature] = [
            .receiptCapture,
            MobileFeature(rawValue: "budgets"),
            MobileFeature(rawValue: "wishlist"),
        ]

        let offered = try offeredTabTitles(available: available)

        #expect(
            offered == available.map(RootCopy.name(of:)),
            Comment(
                rawValue: "the features the BFM said are available are not the features on offer "
                    + "— a feature the app cannot reach is a feature that may as well not exist"
            )
        )
    }

    /// `TabView` is built with no explicit `selection` binding — see
    /// `ContentView`'s own doc comment on why — so UIKit's own default is what
    /// decides which tab is showing on launch. That default is not free-
    /// standing knowledge: it is exactly the assumption
    /// `RootCopy.nothingAvailable` and the six Maestro flows are built on,
    /// that the BFM's first-listed feature is the one a person actually
    /// lands on. This is what makes that assumption a fact rather than a
    /// hope.
    @Test("the first feature the BFM listed is the one selected on launch")
    func theFirstOfferedFeatureIsSelected() throws {
        let switcher = try #require(
            try mountedTabBar(available: [
                .receiptCapture,
                MobileFeature(rawValue: "budgets"),
                MobileFeature(rawValue: "wishlist"),
            ]),
            "more than one feature is available and no tab bar was built for them")

        #expect(
            switcher.selectedIndex == 0,
            "landed on tab \(switcher.selectedIndex) rather than the BFM's first-listed feature"
        )
    }

    @Test("a fourth feature is a fourth tab, not the same tabs again")
    func theTabCountFollowsTheSurface() throws {
        let two = try offeredTabTitles(available: [
            MobileFeature(rawValue: "budgets"), MobileFeature(rawValue: "wishlist"),
        ])
        let four = try offeredTabTitles(available: [
            MobileFeature(rawValue: "budgets"), MobileFeature(rawValue: "wishlist"),
            MobileFeature(rawValue: "goals"), MobileFeature(rawValue: "receipts"),
        ])

        #expect(two.count == 2)
        #expect(four.count == 4, "the switcher is offering a fixed number of features")
    }
}

/// The half of `ContentView`'s feature-count switch neither a type checker nor
/// the mounted tab bar can hold: that every tab's content comes from the one
/// id-to-screen table rather than from a second one grown beside it. Same
/// technique `TransactionsScreenBoundaryTests` uses for its own routing table.
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

    @Test("every screen in the switcher still goes through screen(for:)")
    func theSwitcherStillNamesTheOneScreenTable() {
        // `screen(for:)` is the one place a feature id becomes a view. A
        // switcher that built a view another way would still title its tabs
        // correctly — so the mounted suite above would pass — while quietly
        // forking the id-to-screen mapping this file's own doc comment says
        // lives in one place.
        #expect(Self.contentViewSource.contains("screen(for: feature)"))
    }
}
