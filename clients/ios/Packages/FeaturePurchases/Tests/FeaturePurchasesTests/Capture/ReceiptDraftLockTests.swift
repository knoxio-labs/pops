import Testing

@testable import FeaturePurchases

@Suite("Editing a saved purchase from the navigation bar")
@MainActor
internal struct ReceiptDraftLockTests {
    @Test("Save in the bar holds until the draft differs from the one it opened on")
    func barSaveNeedsAChange() {
        let opened = ReceiptDraft.fake(.tillNamedItems()).attributed()
        var edited = opened
        edited.lines[0].description.value = "Fruit drops"

        #expect(opened.isSaveable, "the fixture has to be saveable to prove the hold")
        #expect(!ReceiptDraftView.canSave(opened, isSaving: false, changedFrom: opened))
        #expect(ReceiptDraftView.canSave(edited, isSaving: false, changedFrom: opened))
        #expect(!ReceiptDraftView.canSave(edited, isSaving: true, changedFrom: opened))
    }

    @Test("a change that leaves the draft unsaveable still holds Save")
    func barSaveStillNeedsASaveableDraft() {
        let opened = ReceiptDraft.fake(.tillNamedItems()).attributed()
        var emptied = opened
        emptied.total.value = ""

        #expect(!ReceiptDraftView.canSave(emptied, isSaving: false, changedFrom: opened))
    }

    @Test("a lock holds exactly the fields it names")
    func lockNamesItsFields() {
        let lock = ReceiptDraftLock(fields: [.merchant, .total], reason: "Matched")

        #expect(lock.locks(.merchant))
        #expect(lock.locks(.total))
        #expect(!lock.locks(.date))
    }
}
