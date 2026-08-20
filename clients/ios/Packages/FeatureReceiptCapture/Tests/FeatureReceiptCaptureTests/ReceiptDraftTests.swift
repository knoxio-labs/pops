import AppCore
import Testing

@testable import FeatureReceiptCapture

/// What the correction form is, asserted as values.
///
/// Nothing here rasterises anything, and that is the point rather than a
/// shortcut. Every claim below — which field a complaint attached to, whether
/// a cleared total is reported, whether an edit survived — is one a render
/// comparison could make only where the colour catalogue compiled, and
/// several are ones it could not make at all: a form and a read-only reading
/// differ by an underline, and on a lane where no token resolves they
/// rasterise to the same canvas.
@Suite("Receipt draft")
internal struct ReceiptDraftTests {}

// MARK: it arrives filled in

extension ReceiptDraftTests {
    @Test("every value the extractor produced is already in the form")
    func extractionPreFillsTheForm() {
        let draft = ReceiptDraft.fake(.tillNamedItems())

        #expect(draft.merchant.value == "Kmart Broadway")
        #expect(draft.address.value == "1 Bay Street, Broadway NSW")
        #expect(draft.date.value == "2026-08-20 17:42")
        #expect(draft.total.value == "31.00")
        #expect(
            draft.lines.map(\.description.value) == [
                "ZCHEETOS C&B BALLS", "ZSOFT TCH BLK TRAY", "ZIRONING BOARD",
            ])
        #expect(draft.lines.map(\.amount.value) == ["4.00", "12.00", "15.00"])
    }

    /// The difference between this and the read-only reading, and the reason
    /// the two cannot share a projection. That one drops what the receipt
    /// never stated, because an empty label reads as a record that failed to
    /// load. Dropping it here would remove the field the reader came to fill
    /// in.
    @Test("a field the extractor read nothing into is present and empty")
    func absentFieldsAreStillFields() {
        let draft = ReceiptDraft.fake(.unnamedItems())

        #expect(draft.address.isEmpty)
        #expect(!draft.address.wasExtracted)
        #expect(draft.date.isEmpty)
        #expect(draft.lines.allSatisfy { $0.description.isEmpty })
        #expect(draft.lines.count == 2, "an unnamed line is still a line")
    }

    /// The quantity and the unit note arrive apart rather than joined into
    /// the one aside the read-only row draws — joined, they cannot be typed
    /// back into two facts.
    @Test("a line's qualifiers are separate values")
    func qualifiersAreSeparateFields() throws {
        let draft = ReceiptDraft.fake(.tillNamedItems())

        #expect(draft.lines[1].quantity.value == "1")
        #expect(draft.lines[1].unitNote.isEmpty)
        #expect(draft.lines[2].quantity.isEmpty)
        #expect(draft.lines[2].unitNote.value == "$15.00 ea")
    }

    @Test("adjustments the receipt stated become rows, in receipt order")
    func adjustmentsBecomeRows() {
        let extracted = ExtractedReceipt(
            merchantName: "ALDI", address: nil, purchasedOn: nil, purchasedAt: nil,
            currency: "AUD", total: "42.03", tax: "3.82", discounts: ["1.00", "0.50"],
            surcharges: ["0.03"], shipping: nil, lines: [], unreadableNotes: [])

        let draft = ReceiptDraft.fake(extracted)

        #expect(draft.adjustments.map(\.kind) == [.tax, .discount, .discount, .surcharge])
        #expect(draft.adjustments.map(\.amount.value) == ["3.82", "1.00", "0.50", "0.03"])
        #expect(Set(draft.adjustments.map(\.id)).count == draft.adjustments.count)
    }

    /// A hand-entered purchase is the same form with nothing in it, not a
    /// second form. If these two ever stop being the same type the two
    /// screens have already drifted.
    @Test("a blank draft is the same shape as a pre-filled one")
    func blankDraftIsTheSameForm() {
        let blank = ReceiptDraft.blank(currency: "AUD")

        #expect(blank.merchant.isEmpty)
        #expect(!blank.merchant.wasExtracted)
        #expect(blank.lines.count == 1, "somewhere to type without hunting for an Add control")
        #expect(blank.adjustments.isEmpty)
        #expect(blank.hints.isEmpty)
    }
}

// MARK: editing is unremarkable

extension ReceiptDraftTests {
    @Test("a pre-filled field takes a change and keeps it")
    func editingAPreFilledFieldSticks() {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.lines[0].description.value = "Cheetos cheese and bacon balls"

        #expect(draft.lines[0].description.value == "Cheetos cheese and bacon balls")
        #expect(draft.lines[0].description.isEdited)
        #expect(draft.isEdited)
    }

    /// A correction can itself be the mistake, and the value wanted back is
    /// the one the model read.
    @Test("the extractor's own reading survives the edit")
    func theOriginalReadingIsKept() {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.lines[0].description.value = "Cheetos cheese and bacon balls"

        #expect(draft.lines[0].description.extracted == "ZCHEETOS C&B BALLS")
    }

    /// Whitespace is a keyboard artefact, not a correction. Counting it would
    /// mark half a form as human-authored the first time somebody scrolled
    /// through it.
    @Test("trailing whitespace is not an edit")
    func whitespaceIsNotAnEdit() {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.merchant.value = "Kmart Broadway  "

        #expect(!draft.merchant.isEdited)
    }

    @Test("a row the model missed can be added, and knows it was not read")
    func aLineCanBeAdded() throws {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.addLine()
        let added = try #require(draft.lines.last)

        #expect(draft.lines.count == 4)
        #expect(!added.wasExtracted)
        #expect(added.description.isEmpty, "an invented value is a claim nobody made")
        #expect(!draft.isEdited, "an empty row offered is not yet something the reader said")

        draft.lines[3].description.value = "Bag"
        draft.lines[3].amount.value = "0.15"

        #expect(draft.isEdited)
    }

    @Test("a row the model invented can be removed")
    func aLineCanBeRemoved() {
        var draft = ReceiptDraft.fake(.tillNamedItems())
        let removed = draft.lines[1].id

        draft.removeLine(id: removed)

        #expect(draft.lines.count == 2)
        #expect(!draft.lines.contains { $0.id == removed })
    }

    /// Two added rows must not collide under `ForEach`, which is how a row
    /// somebody just created disappears as they type into it.
    @Test("two added rows have two identities")
    func addedLinesAreDistinct() {
        var draft = ReceiptDraft.blank(currency: nil)

        draft.addLine()
        draft.addLine()

        #expect(Set(draft.lines.map(\.id)).count == draft.lines.count)
    }

    /// Nothing about this model can express "this field is locked". The
    /// absence is the design, so it is asserted rather than left to be
    /// noticed when somebody adds one.
    @Test("clearing a required field reports it without locking anything else")
    func aClearedRequiredFieldIsReportedNotBlocking() {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.total.value = ""

        #expect(draft.problems.contains(.totalMissing))
        #expect(!draft.isSaveable)

        draft.merchant.value = "Kmart"
        draft.lines[0].description.value = "Cheetos"

        #expect(draft.merchant.value == "Kmart", "an unrelated field stopped accepting input")
        #expect(draft.lines[0].description.value == "Cheetos")
        #expect(draft.total.value.isEmpty, "the cleared field refilled itself")
    }

    @Test("a line with no amount is reported against that line and no other")
    func aLineMissingItsAmountIsReported() {
        var draft = ReceiptDraft.fake(.tillNamedItems())
        let emptied = draft.lines[1].id

        draft.lines[1].amount.value = ""

        #expect(draft.problems == [.lineAmountMissing(lineID: emptied)])
        #expect(draft.problem(forLine: emptied) != nil)
        #expect(draft.problem(forLine: draft.lines[0].id) == nil)
    }

    /// The Salvos receipt. The paper does not name what was bought, and a
    /// form that refused to save it would be refusing the reading that was
    /// correct.
    @Test("a line with an amount and no name is saveable")
    func anUnnamedLineIsFine() {
        let draft = ReceiptDraft.fake(.unnamedItems())

        #expect(draft.problems.isEmpty)
        #expect(draft.isSaveable)
    }

    @Test("a value that was never read and is still empty is not an edit")
    func anUntouchedEmptyFieldIsNotAnEdit() {
        let draft = ReceiptDraft.blank(currency: nil)

        #expect(!draft.isEdited)
    }

    /// A row the form offered is not a row the reader filled in badly.
    /// Reporting it would have the blank form open by accusing somebody of
    /// omitting an amount they were never asked for.
    @Test("an offered row with nothing in it is not reported")
    func aBlankRowIsNotAProblem() {
        var draft = ReceiptDraft.blank(currency: nil)

        draft.addLine()

        #expect(!draft.problems.contains { $0 != .totalMissing })
    }

    /// Same rule at the other end: the Save that cannot be pressed already
    /// says the form is not finished, and a red rule under an untouched field
    /// is the screen telling somebody off for not having started.
    @Test("an untouched blank form does not open by naming what is missing")
    func aBlankFormDoesNotAccuse() {
        var draft = ReceiptDraft.blank(currency: nil)

        #expect(!draft.isSaveable, "it still cannot be saved")
        #expect(!draft.reportsMissingTotal, "and it does not say so in red before anyone types")

        draft.merchant.value = "Market stall"

        #expect(draft.reportsMissingTotal, "once there is something to save, say what stops it")
    }

    /// A reading that arrived with a total and had it emptied is a real
    /// omission from the first keystroke — there is nothing tentative about
    /// deleting a figure the model read.
    @Test("emptying a total that was read is named immediately")
    func anEmptiedExtractedTotalIsNamed() {
        var draft = ReceiptDraft.fake(.tillNamedItems())

        draft.total.value = ""

        #expect(draft.reportsMissingTotal)
    }
}
