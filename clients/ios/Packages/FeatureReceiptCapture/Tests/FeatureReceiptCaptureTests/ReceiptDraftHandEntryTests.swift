import Testing

@testable import FeatureReceiptCapture

/// Typing purchases one after another: what the next blank form keeps, and
/// what it must not claim.
///
/// The claim that matters most is the quiet one. A form opened by Save and add
/// another carries the date forward, and if that counted as an edit the form
/// would open by naming a missing total and merchant before anyone had typed a
/// thing, which is the accusation a blank form exists not to make.
@Suite("Receipt draft hand entry")
@MainActor
internal struct ReceiptDraftHandEntryTests {
    private let presentation = ReceiptDraftPresentation()

    @Test("the next form keeps the date and the currency")
    func keepsDateAndCurrency() {
        let previous = ReceiptDraft.fake(.tillNamedItems())

        let next = presentation.blankDraft(after: previous)

        #expect(!previous.date.isEmpty, "the fixture has to carry a date to prove anything")
        #expect(previous.currency != nil, "and a currency")
        #expect(next.date.value == previous.date.value)
        #expect(next.currency == previous.currency)
    }

    /// A carried merchant would file the next purchase under the last shop
    /// the moment somebody forgot to change it.
    @Test("everything that identifies the purchase starts empty")
    func identifyingFieldsStartEmpty() {
        var previous = ReceiptDraft.fake(.tillNamedItems())
        previous.setMerchant(.chosen(id: "ent-kmart"))

        let next = presentation.blankDraft(after: previous)

        #expect(next.merchantResolution == .unresolved)
        #expect(next.addressResolution == .unresolved)
        #expect(next.printedMerchant.isEmpty)
        #expect(next.total.isEmpty)
        #expect(next.adjustments.isEmpty)
        #expect(next.lines.count == 1)
        #expect(next.lines.allSatisfy { $0.description.isEmpty && $0.amount.isEmpty })
    }

    @Test("a carried date is not an edit, so the new form does not open by naming what is missing")
    func aCarriedDateIsNotAnEdit() {
        let next = presentation.blankDraft(after: ReceiptDraft.fake(.tillNamedItems()))

        #expect(!next.date.isEdited)
        #expect(!next.date.wasExtracted, "it was not read off paper either")
        #expect(!next.isEdited)
        #expect(!next.reportsMissingTotal)
        #expect(!next.reportsUnresolvedMerchant)
    }

    @Test("changing a carried date is an edit")
    func changingACarriedDateIsAnEdit() {
        var next = presentation.blankDraft(after: ReceiptDraft.fake(.tillNamedItems()))

        next.date.value = "2026-08-21"

        #expect(next.date.isEdited)
    }

    @Test("neither save can be pressed while one is in flight, or before the form is saveable")
    func bothSavesHold() {
        let saveable = ReceiptDraft.fake(.tillNamedItems()).attributed()

        #expect(saveable.isSaveable, "the fixture has to be saveable to prove the hold")
        #expect(ReceiptDraftView.canSave(saveable, isSaving: false))
        #expect(!ReceiptDraftView.canSave(saveable, isSaving: true))
        #expect(!ReceiptDraftView.canSave(ReceiptDraft.blank(currency: nil), isSaving: false))
    }
}
