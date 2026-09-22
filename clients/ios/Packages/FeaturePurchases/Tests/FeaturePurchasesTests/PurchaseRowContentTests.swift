import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@Suite("Purchase row content")
@MainActor
internal struct PurchaseRowContentTests {
    @Test("an unattributed purchase uses the shared muted merchant presentation")
    func unattributedPurchaseIsMuted() {
        let purchase = Purchase.fake(merchant: .unattributed)
        let content = PurchaseRowContent(purchase: purchase)

        #expect(content.title == PurchasesPresentation.merchant(purchase))
        #expect(content.muted)
    }

    @Test("badge false omits a partial settlement badge")
    func badgeCanBeOmitted() {
        let content = PurchaseRowContent(purchase: .fake(status: .partial), badge: false)

        #expect(content.badge == nil)
    }

    @Test("badge true carries the purchase settlement")
    func badgeCanBeIncluded() {
        let content = PurchaseRowContent(purchase: .fake(status: .partial), badge: true)

        #expect(content.badge == .partial)
    }

    @Test("the amount is the purchase total unchanged")
    func amountIsUnchanged() {
        let amount = MoneyAmount(minorUnits: 4_321, currencyCode: "NZD")
        let content = PurchaseRowContent(purchase: .fake(total: amount))

        #expect(content.amount == amount)
    }
}
