import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase entity")
internal struct PurchaseEntityTests {
    @Test("parses a purchase URI")
    func parsesPurchaseURI() {
        let entity = PurchaseEntity(PopsURI(pillar: "purchases", type: "purchase", id: "p1"))

        #expect(entity?.purchaseId == "p1")
        #expect(entity?.id == "p1")
    }

    @Test("rejects purchase lines and URIs for other domains")
    func rejectsOtherURIs() {
        #expect(
            PurchaseEntity(
                PopsURI(pillar: "purchases", type: "purchase-item", id: "line-1")) == nil)
        #expect(PurchaseEntity(PopsURI(pillar: "finance", type: "purchase", id: "p1")) == nil)
    }

    @Test("every declared purchase type parses")
    func everyDeclaredTypeParses() {
        #expect(
            PurchaseEntity.types.allSatisfy {
                PurchaseEntity(PopsURI(pillar: PurchaseEntity.pillar, type: $0, id: "p1")) != nil
            }
        )
    }

    @Test("the detail model loads the id from its entity")
    func detailModelLoadsEntityID() async {
        guard
            let entity = PurchaseEntity(
                PopsURI(pillar: "purchases", type: "purchase", id: "p1"))
        else {
            Issue.record("the purchase URI should produce an entity")
            return
        }

        let expected = PurchaseDetail.fake(purchase: .fake(id: "p1"))
        let other = PurchaseDetail.fake(purchase: .fake(id: "p2"))
        let repository = InMemoryPurchasesRepository(details: [expected, other])
        let model = PurchaseDetailViewModel(
            id: entity.purchaseId,
            dependencies: .fake(purchases: repository)
        )

        await model.load()

        #expect(model.phase == .loaded(expected, refresh: nil))
    }
}
