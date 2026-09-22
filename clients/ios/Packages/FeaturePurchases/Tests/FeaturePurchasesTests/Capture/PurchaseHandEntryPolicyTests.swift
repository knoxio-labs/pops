import Testing

@testable import FeaturePurchases

@Suite("Purchase hand-entry policy")
internal struct PurchaseHandEntryPolicyTests {
    @Test("hand entry exposes stable root and save identifiers")
    func accessibilityIdentifiers() {
        #expect(PurchaseHandEntryAccessibility.root == "purchases-hand-entry")
        #expect(PurchaseHandEntryAccessibility.save == "purchases-hand-entry-save")
    }
    @Test("an untouched form cancels immediately")
    func untouchedCancel() {
        let opened = ReceiptDraftPresentation().blankDraft(currency: "AUD")

        #expect(!PurchaseHandEntryPolicy.asksBeforeCancel(draft: opened, opened: opened))
    }

    @Test("one edit asks before discarding")
    func editedCancel() {
        let opened = ReceiptDraftPresentation().blankDraft(currency: "AUD")
        var edited = opened
        edited.total.value = "12.50"

        #expect(PurchaseHandEntryPolicy.asksBeforeCancel(draft: edited, opened: opened))
    }

    @Test("cancel explains whether earlier purchases stay saved")
    func cancelMessage() {
        #expect(PurchaseHandEntryPolicy.cancelMessage(saved: 0) == "Nothing is saved yet.")
        #expect(PurchaseHandEntryPolicy.cancelMessage(saved: 2) == "2 are saved and stay saved.")
    }
}
