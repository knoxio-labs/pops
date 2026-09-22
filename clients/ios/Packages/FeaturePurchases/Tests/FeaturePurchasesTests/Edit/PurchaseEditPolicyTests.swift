import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@Suite("Purchase edit policy")
internal struct PurchaseEditPolicyTests {
    @Test(
        "matched and unknown settlements lock identity fields",
        arguments: [PurchaseSettlement.linked, .partial, .unrecognised("refunded")])
    func matchedFieldsAreLocked(status: PurchaseSettlement) {
        #expect(PurchaseEditPolicy.lockedFields(for: status) == [.merchant, .date, .total])
        #expect(PurchaseEditPolicy.lock(for: status) != nil)
    }

    @Test(
        "unmatched and terminal local settlements keep identity fields editable",
        arguments: [
            PurchaseSettlement.awaitingSettlement, .settledCash, .ignored,
        ])
    func unmatchedFieldsAreEditable(status: PurchaseSettlement) {
        #expect(PurchaseEditPolicy.lockedFields(for: status).isEmpty)
        #expect(PurchaseEditPolicy.lock(for: status) == nil)
    }

    @Test("only an Inventory-linked line carries the unlink notice")
    func unlinkNotice() {
        let linked = PurchaseDetailLine.fake(hasInventoryLink: true)
        let unlinked = PurchaseDetailLine.fake(hasInventoryLink: false)

        #expect(
            PurchaseEditPolicy.unlinkNotice(for: linked)
                == "Removing this unlinks it from Inventory")
        #expect(PurchaseEditPolicy.unlinkNotice(for: unlinked) == nil)
    }
}
