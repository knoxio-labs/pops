import Testing

@testable import AppCore

@MainActor
@Suite("EntityRouterRegistry")
internal struct EntityRouterTests {
    @Test("dispatches to the handler registered for the pair")
    func dispatchesToTheRegisteredHandler() {
        let router = EntityRouterRegistry()
        var routed: PopsURI?
        router.register(pillar: "inventory", type: "item") { routed = $0 }

        let uri = PopsURI(pillar: "inventory", type: "item", id: "item-1")
        let outcome = router.route(uri)

        #expect(outcome == .handled)
        #expect(routed == uri)
    }

    @Test("an unknown pillar yields the approved hand-off")
    func unknownPillarYieldsAHandOff() {
        let router = EntityRouterRegistry()
        router.register(pillar: "inventory", type: "item") { _ in }

        let outcome = router.route(PopsURI(pillar: "finance", type: "transaction", id: "txn-1"))

        #expect(outcome == .unsupported(pillar: "finance"))
    }

    @Test("a known pillar with an unregistered type yields the hand-off too")
    func unregisteredTypeYieldsAHandOff() {
        let router = EntityRouterRegistry()
        router.register(pillar: "inventory", type: "item") { _ in }

        let outcome = router.route(PopsURI(pillar: "inventory", type: "location", id: "loc-1"))

        #expect(outcome == .unsupported(pillar: "inventory"))
    }

    @Test("registering the same pair again replaces the previous handler")
    func reregisteringReplacesTheHandler() {
        let router = EntityRouterRegistry()
        router.register(pillar: "inventory", type: "item") { _ in
            Issue.record("stale handler ran")
        }
        router.register(pillar: "inventory", type: "item") { _ in }

        let outcome = router.route(PopsURI(pillar: "inventory", type: "item", id: "item-1"))

        #expect(outcome == .handled)
    }

    @Test("routing nothing registered yet reports the pillar, not a crash")
    func noHandlersAtAllYieldsAHandOff() {
        let router = EntityRouterRegistry()

        let outcome = router.route(PopsURI(pillar: "media", type: "watchlist-entry", id: "1"))

        #expect(outcome == .unsupported(pillar: "media"))
    }
}
