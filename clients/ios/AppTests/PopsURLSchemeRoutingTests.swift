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
        handleOpenPopsURL(url, router: router)

        #expect(routed == PopsURI(pillar: "inventory", type: "item", id: "item-42"))
    }

    /// No feature has registered `inventory/item` on `main` yet (`FeatureInventory`
    /// is not merged), so today every real label opened this way reaches the
    /// approved hand-off rather than a handler — which is correct, not a gap
    /// this slice needs to close.
    @Test("a well-formed pops URL with nothing registered reaches the hand-off, not a crash")
    func unregisteredDestinationReachesTheHandOff() throws {
        let router = EntityRouterRegistry()
        let uri = PopsURI(pillar: "inventory", type: "location", id: "loc-1")

        let url = try #require(URL(string: "pops://inventory/location/loc-1"))
        handleOpenPopsURL(url, router: router)

        #expect(router.route(uri) == .unsupported(pillar: "inventory"))
    }

    /// A URL that never parses as a ``PopsURI`` — wrong scheme, or too few
    /// segments — never reaches the router at all, so a handler for an
    /// unrelated pair is left untouched rather than invoked with garbage.
    @Test("a URL that is not a pops soft reference is ignored")
    func malformedURLIsIgnored() throws {
        let router = EntityRouterRegistry()
        var invocationCount = 0
        router.register(pillar: "inventory", type: "item") { _ in invocationCount += 1 }

        let notPops = try #require(URL(string: "https://example.com/inventory/item/1"))
        handleOpenPopsURL(notPops, router: router)
        let tooFewSegments = try #require(URL(string: "pops://inventory/item"))
        handleOpenPopsURL(tooFewSegments, router: router)

        #expect(invocationCount == 0)
    }
}
