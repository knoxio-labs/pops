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
            PurchaseSettlement.awaitingSettlement, .settledCash, .ignored, .nothingToSettle,
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

    @Test("an unchanged unresolved merchant does not block saved line edits")
    func unchangedUnresolvedMerchantCanSave() {
        var opened = ReceiptDraft.blank(currency: "AUD")
        opened.total.value = "12.00"
        opened.lines[0].description.value = "Bread"
        opened.lines[0].amount.value = "12.00"
        var draft = opened
        draft.lines[0].description.value = "Sourdough"

        #expect(PurchaseEditPolicy.canSave(draft, opened: opened))
    }

    @Test("new validation problems still block a saved edit")
    func newProblemsBlockSave() {
        var opened = ReceiptDraft.blank(currency: "AUD")
        opened.total.value = "12.00"
        opened.lines[0].description.value = "Bread"
        opened.lines[0].amount.value = "12.00"
        var missingAmount = opened
        missingAmount.lines[0].amount.value = ""

        #expect(!PurchaseEditPolicy.canSave(missingAmount, opened: opened))
    }

    @Test("saved purchase forms hide fields the update contract cannot persist")
    func savedPurchasePresentation() {
        #expect(!ReceiptDraftForm.Presentation.savedPurchase.showsCaptureOnlyFields)
        #expect(ReceiptDraftForm.Presentation.receiptReading.showsCaptureOnlyFields)
    }
}
