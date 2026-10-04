import AppCore
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego entity card presentation")
internal struct EgoEntityCardPresentationTests {
    @Test("maps each supported URI kind to a unique symbol")
    func supportedURIsUseDistinctSymbols() {
        let cases: [(String, EgoEntityCardPresentation.Kind)] = [
            ("pops:finance/transaction/txn-1", .transaction),
            ("pops:finance/account/account-1", .account),
            ("pops:finance/budget/budget-1", .budget),
            ("pops:purchases/purchase/purchase-1", .purchase),
            ("pops:inventory/item/item-1", .inventoryItem),
            ("pops:inventory/location/location-1", .inventoryLocation),
            ("pops:media/movie/movie-1", .movie),
            ("pops:media/tv-show/show-1", .tvShow),
            ("pops:cerebrum/engram/engram-1", .engram),
            ("pops:lists/list/list-1", .generic),
        ]

        let presentations = cases.map { uri, _ in presentation(uri: uri) }

        for ((uri, expectedKind), result) in zip(cases, presentations) {
            #expect(result.kind == expectedKind, "Unexpected kind for \(uri)")
            #expect(result.isTappable)
            #expect(result.uri != nil)
            #expect(!result.symbolName.isEmpty)
        }

        let symbols = presentations.map(\.symbolName)
        #expect(Set(symbols).count == EgoEntityCardPresentation.Kind.allCases.count)
    }

    @Test("unrecognized parsed URIs are generic and tappable")
    func unknownEntityStaysRoutable() {
        let result = presentation(uri: "pops:lists/list/1")

        #expect(result.kind == .generic)
        #expect(result.isTappable)
        #expect(result.uri == PopsURI(pillar: "lists", type: "list", id: "1"))
    }

    @Test("invalid URIs are generic and not tappable")
    func malformedURIsAreNotTappable() {
        for uri in ["not a uri", "pops://finance/transaction/1"] {
            let result = presentation(uri: uri)

            #expect(result.kind == .generic)
            #expect(!result.isTappable)
            #expect(result.uri == nil)
        }
    }

    @Test("accessibility includes the kind noun, title, and available subtitle")
    func accessibilityLabelUsesEntityContent() {
        let withSubtitle = EgoEntityCardPresentation(
            part: EgoEntityPart(
                uri: "pops:finance/transaction/txn-1",
                title: "Corner Cafe",
                subtitle: "$8.50"
            )
        )
        let withoutSubtitle = EgoEntityCardPresentation(
            part: EgoEntityPart(uri: "not a uri", title: "Recent note", subtitle: nil)
        )

        #expect(withSubtitle.accessibilityLabel == "Transaction, Corner Cafe, $8.50")
        #expect(withoutSubtitle.accessibilityLabel == "Entity, Recent note")
    }

    @Test("routes registered entities and reports unsupported pillars")
    func routesParsedEntities() {
        let router = EntityRouterRegistry()
        var routedId: String?
        router.register(pillar: "finance", type: "transaction") { routedId = $0.id }

        let transaction = routeEgoEntity(
            EgoEntityPart(uri: "pops:finance/transaction/txn-9", title: "Cafe", subtitle: nil),
            router: router
        )
        let movie = routeEgoEntity(
            EgoEntityPart(uri: "pops:media/movie/movie-9", title: "Arrival", subtitle: nil),
            router: router
        )
        let invalid = routeEgoEntity(
            EgoEntityPart(uri: "not a uri", title: "Unknown", subtitle: nil),
            router: router
        )

        #expect(transaction == .handled)
        #expect(routedId == "txn-9")
        #expect(movie == .unsupported(pillar: "media"))
        #expect(invalid == nil)
    }

    private func presentation(uri: String) -> EgoEntityCardPresentation {
        EgoEntityCardPresentation(part: EgoEntityPart(uri: uri, title: "Title", subtitle: nil))
    }
}
