import AppCore
import Foundation
import Testing

@testable import Pops

/// `handleOpenPopsURL` is the whole of what the `pops` URL scheme does: parse,
/// then hand the result to ``EntityRouter``. It lives in `App/`, which is in
/// no package, so this hosted target is the only place it can be tested.
@Suite("pops URL scheme routing")
@MainActor
internal struct PopsURLSchemeRoutingTests {
    /// The scanner and the URL scheme are documented to resolve through the
    /// same seam (`EntityRouter.swift`), so a label's soft reference opened
    /// via `onOpenURL` reaches whichever feature registered its `(pillar,
    /// type)` pair — here, the item destination.
    @Test("a well-formed pops URL routes to the registered item destination")
    func routesToTheRegisteredDestination() throws {
        let router = EntityRouterRegistry()
        var routed: PopsURI?
        router.register(pillar: "inventory", type: "item") { routed = $0 }

        let url = try #require(URL(string: "pops://inventory/item/item-42"))
        let outcome = handleOpenPopsURL(url, router: router)

        #expect(routed == PopsURI(pillar: "inventory", type: "item", id: "item-42"))
        #expect(outcome == .handled)
    }

    /// No feature has registered `inventory/location` on `main` yet
    /// (`FeatureInventory` is not merged), so today every real label opened
    /// this way is unsupported — which is correct, not a gap this slice needs
    /// to close. What this slice does need is for that outcome to reach the
    /// caller rather than being discarded: `RootView` reads it from
    /// `handleOpenPopsURL`'s return value to show the person a message, so a
    /// regression that goes back to swallowing it (`_ = router.route(uri)`)
    /// must fail here, not just at the router.
    @Test("a well-formed pops URL with nothing registered returns the outcome the caller shows")
    func unregisteredDestinationReturnsTheOutcomeToShow() throws {
        let router = EntityRouterRegistry()

        let url = try #require(URL(string: "pops://inventory/location/loc-1"))
        let outcome = handleOpenPopsURL(url, router: router)

        #expect(outcome == .unsupported(pillar: "inventory"))
    }

    /// A URL that never parses as a ``PopsURI`` — wrong scheme, or too few
    /// segments — never reaches the router at all, so a handler for an
    /// unrelated pair is left untouched rather than invoked with garbage, and
    /// there is no outcome for a caller to show.
    @Test("a URL that is not a pops soft reference is ignored")
    func malformedURLIsIgnored() throws {
        let router = EntityRouterRegistry()
        var invocationCount = 0
        router.register(pillar: "inventory", type: "item") { _ in invocationCount += 1 }

        let notPops = try #require(URL(string: "https://example.com/inventory/item/1"))
        let notPopsOutcome = handleOpenPopsURL(notPops, router: router)
        let tooFewSegments = try #require(URL(string: "pops://inventory/item"))
        let tooFewSegmentsOutcome = handleOpenPopsURL(tooFewSegments, router: router)

        #expect(invocationCount == 0)
        #expect(notPopsOutcome == nil)
        #expect(tooFewSegmentsOutcome == nil)
    }
}
