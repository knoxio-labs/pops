import AppCore
import Auth
import FeatureInventory
import FeaturePurchases
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

    internal static func view(
        available: [MobileFeature],
        bootstrap: BootstrapPhase = .answered(.fresh),
        purchasesCaptureObserver: (@MainActor (Bool) -> Void)? = nil
    ) -> ContentView {
        let bound = AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: namespace)
            )
        )
        return ContentView(
            surface: FeatureSurface(
                available: available, unavailable: [], bootstrap: bootstrap),
            shell: bound.shell,
            composition: bound,
            purchasesCaptureObserver: purchasesCaptureObserver
        )
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
/// ## Why the single-feature path is not rendered here
///
/// `TransactionsFlowView` is the one screen this suite must not construct.
/// Rendering it through `ImageRenderer` — even indirectly, through
/// `ContentView` — crashes the host process outright:
/// `SwiftUICore/Logging.swift:232: Fatal error: no current update to enqueue
/// action to`, from the list's `.task` starting real async work outside a
/// SwiftUI transaction `ImageRenderer` never opens. That is the same
/// limitation `TransactionDetailRenderingTests` documents and works around by
/// rendering `TransactionDetailCard` rather than the screen it sits in.
/// `ContentView`'s single-feature path had an equivalent safe substitute —
/// `ReceiptCaptureView`, a screen with an observable model but no `.task` —
/// until POPS-4294 removed it; every screen `RootFeature.renderable` maps to
/// today starts with a `.task` of its own, so nothing left in this build can
/// stand in for it, and the pixel comparison that regression once protected
/// lives on in `ContentViewTabSwitcherTests/oneFeatureBuildsNoTabBar`, which
/// proves the same "no tab bar for a single feature" claim by mounting rather
/// than rasterising.
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

    /// POPS-4191: Inventory's search flow lives in the tab bar's search slot,
    /// not inside the Inventory tab — so Inventory being the *only* available
    /// feature must not fall into the single-feature, no-tab-bar path above:
    /// there are two things to switch between even then.
    @Test("Inventory alone still gets a tab bar, for its search sibling")
    func inventoryAloneGetsATabBarForItsSearchSibling() throws {
        let switcher = try #require(
            try mountedTabBar(available: [FeatureInventory.feature]),
            "Inventory is available alone but no tab bar was built for its search sibling"
        )

        #expect(
            switcher.tabBar.items?.count == 2,
            Comment(
                rawValue: "expected Inventory's own tab plus its search sibling, found "
                    + "\(switcher.tabBar.items?.count ?? 0)"
            )
        )
    }

    /// POPS-2894: the degraded banner is drawn above the tab bar's content,
    /// not stacked above the tab bar itself — so the bar's own position in the
    /// window must not move when the banner appears. A `VStack` ahead of
    /// `features` would take the banner's height off the top of the whole
    /// tree, including the `TabView`, shifting this frame up by exactly that
    /// height; this is the regression the ticket is named after, made into an
    /// assertion a future edit to `ContentView.body` can trip.
    @Test("the tab bar does not move when the degraded banner appears")
    func tabBarFrameIsUnaffectedByTheDegradedBanner() throws {
        let available: [MobileFeature] = [.receiptCapture, MobileFeature(rawValue: "budgets")]

        func mount(bootstrap: BootstrapPhase) throws -> UITabBarController {
            let scene = try #require(
                UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
                "the test host is not showing a window scene, so nothing can be mounted in one"
            )
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(origin: .zero, size: Self.canvas)
            window.rootViewController = UIHostingController(
                rootView: ContentViewFixture.view(available: available, bootstrap: bootstrap))
            window.makeKeyAndVisible()
            window.layoutIfNeeded()
            defer { window.isHidden = true }

            return try #require(
                Self.tabBarController(in: window.rootViewController),
                "more than one feature is available and no tab bar was built for them"
            )
        }

        let steady = try mount(bootstrap: .answered(.fresh))
        let degraded = try mount(bootstrap: .failed(.unavailable))

        #expect(
            steady.tabBar.frame == degraded.tabBar.frame,
            Comment(
                rawValue: "the tab bar's frame changed once the degraded banner was showing — "
                    + "it is being displaced rather than the banner sitting in a safe-area inset"
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

    @Test("Purchases threads capture availability through its own flow")
    func purchasesThreadsCaptureAvailability() {
        #expect(Self.contentViewSource.contains("captureAvailable: surface.available.contains"))
    }

    @Test("the retired Receipts tab has no case of its own left to route through")
    func receiptsTabHasNoScreenCase() {
        #expect(!Self.contentViewSource.contains("ReceiptCaptureTab.feature"))
        #expect(!Self.contentViewSource.contains("ReceiptCaptureView(model:"))
    }
}
