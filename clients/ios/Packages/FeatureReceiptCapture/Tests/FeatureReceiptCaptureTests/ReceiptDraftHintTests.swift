import AppCore
import DesignSystem
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture

/// What the form says about a reading it is not sure of, and about whether
/// the figures add up.
///
/// Kept apart from ``ReceiptDraftTests`` because the claims are about two
/// different things: that one is about the form being a form — pre-filled,
/// editable, reporting what is missing — and this is about the two kinds of
/// commentary drawn beside it. Both are values rather than renders, for the
/// reason that suite gives.
@Suite("Receipt draft hints and arithmetic")
internal struct ReceiptDraftHintTests {
    private static let presentation = ReceiptDraftPresentation()

    /// A receipt whose reading is complete and correct, and whose items are
    /// named the way a till prints them. The Kmart case: nothing is wrong, and
    /// the reader still wants to change three names.
    private static func cleanExtraction() -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: "Kmart Broadway",
            address: "1 Bay Street, Broadway NSW",
            purchasedOn: "2026-08-20",
            purchasedAt: "17:42",
            currency: "AUD",
            total: "31.00",
            tax: nil,
            discounts: [],
            surcharges: [],
            shipping: nil,
            lines: [
                ExtractedReceiptLine(
                    description: "ZCHEETOS C&B BALLS", amount: "4.00", quantity: nil,
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "ZSOFT TCH BLK TRAY", amount: "12.00", quantity: 1,
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "ZIRONING BOARD", amount: "15.00", quantity: nil,
                    unitNote: "$15.00 ea"),
            ],
            unreadableNotes: []
        )
    }

    /// The Salvos case: the reading is fine and the paper simply does not
    /// name what was bought.
    private static func unnamedExtraction() -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: "Salvos Stores",
            address: nil,
            purchasedOn: nil,
            purchasedAt: nil,
            currency: nil,
            total: "12.00",
            tax: nil,
            discounts: [],
            surcharges: [],
            shipping: nil,
            lines: [
                ExtractedReceiptLine(
                    description: "", amount: "8.00", quantity: nil, unitNote: nil),
                ExtractedReceiptLine(
                    description: "", amount: "4.00", quantity: nil, unitNote: nil),
            ],
            unreadableNotes: []
        )
    }

    private static func draft(
        _ extracted: ExtractedReceipt, failures: [ReceiptGateFailure] = []
    ) -> ReceiptDraft {
        presentation.draft(extracted: extracted, failures: failures)
    }
}

// MARK: hints point at fields, and lock nothing

extension ReceiptDraftHintTests {
    /// The Priceline case. The complaint is about three product descriptions,
    /// and it belongs beside them rather than in a list at the top of the
    /// screen that the reader has to hold in mind while looking elsewhere.
    @Test("a complaint about the lines is attached to the lines")
    func lineComplaintsAttachToTheLines() throws {
        let failure = ReceiptGateFailure(
            kind: .unreadableLine,
            detail: "The left edge of the 2nd and 3rd product description lines is distorted",
            deltaCents: nil)

        let draft = Self.draft(Self.cleanExtraction(), failures: [failure])

        #expect(draft.hints[.lines] == [failure.detail])
        #expect(draft.hints[.merchant] == nil)
        #expect(draft.unattachedHints.isEmpty)
    }

    @Test(
        "each kind lands on the field it names",
        arguments: [
            (ReceiptGateFailureKind.unreadableTotal, ReceiptDraftField.total),
            (.sumMismatch, .total),
            (.unreadableLine, .lines),
            (.noLines, .lines),
            (.negativeLine, .lines),
            (.ambiguousTax, .adjustments),
        ] as [(ReceiptGateFailureKind, ReceiptDraftField)])
    func kindsAttachToTheirField(kind: ReceiptGateFailureKind, field: ReceiptDraftField) {
        let draft = Self.draft(
            Self.cleanExtraction(),
            failures: [ReceiptGateFailure(kind: kind, detail: "detail", deltaCents: nil)])

        #expect(draft.hints[field] == ["detail"])
        #expect(draft.unattachedHints.isEmpty)
    }

    /// A receipt read as damaged is a statement about the paper. Pinning it
    /// to the nearest field would send the reader to check something that is
    /// fine.
    @Test(
        "a complaint that names no field stays unattached",
        arguments: [ReceiptGateFailureKind.damaged, .unrecognised("negative-shipping")])
    func unattachedComplaintsStayUnattached(kind: ReceiptGateFailureKind) {
        let draft = Self.draft(
            Self.cleanExtraction(),
            failures: [
                ReceiptGateFailure(kind: kind, detail: "the corner is torn", deltaCents: nil)
            ]
        )

        #expect(draft.unattachedHints == ["the corner is torn"])
        #expect(draft.hints.isEmpty)
    }

    /// The gate's own detail is what points at the thing to look at. Without
    /// one the reader gets the kind's sentence, never the wire code.
    @Test("a complaint with no detail falls back to the reader-facing wording")
    func complaintsWithoutDetailUseTheLabel() {
        let draft = Self.draft(
            Self.cleanExtraction(),
            failures: [ReceiptGateFailure(kind: .noLines, detail: "  ", deltaCents: nil)])

        #expect(draft.hints[.lines] == [ReceiptResultCopy.gateFailureLabel(.noLines)])
    }

    /// A hint is a prompt to look, never a lock. If a hint ever started
    /// blocking a save it would have become the gate the ticket exists to
    /// remove.
    @Test("a hinted field is saveable and editable like any other")
    func hintsBlockNothing() {
        var draft = Self.draft(
            Self.cleanExtraction(),
            failures: [
                ReceiptGateFailure(kind: .unreadableTotal, detail: "smudged", deltaCents: nil)
            ]
        )

        #expect(draft.isSaveable)

        draft.total.value = "31.50"

        #expect(draft.total.value == "31.50")
        #expect(draft.isSaveable)
    }

    /// A missing total is what stops a save; the gate's complaint about the
    /// same field is not. A reader who has just emptied the total needs to be
    /// told that, not reminded the print was smudged.
    @Test("a problem on a field outranks a hint on it")
    func problemsOutrankHints() {
        let hint = PopsFieldNote.hint("smudged")
        let problem = PopsFieldNote.problem(ReceiptDraftCopy.totalMissing)

        #expect(hint.tone == .warning)
        #expect(problem.tone == .danger)
        #expect(hint.tone != problem.tone, "a prompt to look reads as an accusation")
    }
}

// MARK: what the screen may say about the arithmetic

extension ReceiptDraftHintTests {
    /// The reassurance that makes renaming three items safe: it says which
    /// numbers not to touch.
    @Test("a reading the gate did not dispute is reported as balancing")
    func aBalancedReadingSaysSo() {
        let draft = Self.draft(Self.cleanExtraction())

        #expect(draft.reconciliation == .reconciledAsRead)
        #expect(ReceiptDraftReconciliationCopy(draft.reconciliation).tone == .success)
    }

    @Test("a disputed reading carries the gate's own wording for the gap")
    func aDisputedReadingCarriesTheDelta() {
        let draft = Self.draft(
            Self.cleanExtraction(),
            failures: [
                ReceiptGateFailure(kind: .sumMismatch, detail: "out by", deltaCents: -250)
            ])

        #expect(draft.reconciliation == .disputedAsRead(ReceiptResultCopy.deltaCents(-250)))
        #expect(ReceiptDraftReconciliationCopy(draft.reconciliation).tone == .warning)
    }

    /// The gate checked numbers the model read. The moment one changes, the
    /// check is about numbers that are no longer on screen, and repeating it
    /// would be this screen vouching for arithmetic nobody has done.
    @Test("a changed figure withdraws the claim rather than restating it")
    func editingAnAmountWithdrawsTheClaim() {
        var draft = Self.draft(Self.cleanExtraction())

        draft.lines[0].amount.value = "4.50"

        #expect(draft.reconciliation == .notRechecked)
        #expect(ReceiptDraftReconciliationCopy(draft.reconciliation).tone == .information)
    }

    /// Renaming is not arithmetic. A reader improving three names must not be
    /// told the sums have changed.
    @Test("renaming an item leaves the arithmetic claim standing")
    func renamingDoesNotWithdrawTheClaim() {
        var draft = Self.draft(Self.cleanExtraction())

        draft.lines[0].description.value = "Cheetos cheese and bacon balls"
        draft.merchant.value = "Kmart"

        #expect(draft.reconciliation == .reconciledAsRead)
    }

    @Test("changing an adjustment counts as changing a figure")
    func editingAnAdjustmentWithdrawsTheClaim() {
        var draft = Self.draft(
            ExtractedReceipt(
                merchantName: nil, address: nil, purchasedOn: nil, purchasedAt: nil,
                currency: nil, total: "10.00", tax: "1.00", discounts: [], surcharges: [],
                shipping: nil, lines: [], unreadableNotes: []))

        draft.adjustments[0].amount.value = "1.50"

        #expect(draft.reconciliation == .notRechecked)
    }

    /// Three states, three tones. Two of them sharing one would make the
    /// difference between "this balances" and "nobody has checked" invisible
    /// to somebody scanning.
    @Test("the three arithmetic states are three tones")
    func reconciliationTonesAreDistinct() {
        let tones = [
            ReceiptDraftReconciliation.reconciledAsRead,
            .disputedAsRead(nil),
            .notRechecked,
        ].map { ReceiptDraftReconciliationCopy($0).tone }

        #expect(Set(tones).count == tones.count)
    }
}

// MARK: the layout decisions that are values

extension ReceiptDraftHintTests {
    /// The editable row breaks at the same size the read-only one does. Two
    /// thresholds would mean the reading and the form reflow at different
    /// text sizes, which is one surface behaving as two.
    @Test(
        "the editable row stacks exactly where the read-only row does",
        arguments: DynamicTypeSize.allCases)
    func theEditableRowStacksWithTheReadOnlyOne(size: DynamicTypeSize) {
        let stacks = ReceiptLineLayout.stacks(at: size)

        #expect((ReceiptDraftLineRow.amountWidth(at: size, column: 100) == nil) == stacks)
        #expect((ReceiptDraftLineRow.quantityWidth(at: size, column: 40) == nil) == stacks)
    }

    /// Below the stacking threshold the amount keeps its column, so a reader
    /// can run down the figures the way they run down a receipt.
    @Test("the amount keeps a column of its own while the row is a row")
    func theAmountKeepsItsColumn() {
        #expect(ReceiptDraftLineRow.amountWidth(at: .large, column: 112) == 112)
        #expect(ReceiptDraftLineRow.quantityWidth(at: .large, column: 72) == 72)
    }
}

// MARK: the words

extension ReceiptDraftHintTests {
    /// The framing this whole screen turns on. Copy that told the reader the
    /// model failed would make the common case — a correct reading somebody
    /// wants to improve — read as an accusation.
    @Test("nothing in the form's own copy blames a failed reading")
    func theCopyDoesNotFrameEditingAsRescue() {
        let blaming = ["failed", "error", "wrong", "invalid", "couldn't be read", "fix"]
        let copy = [
            ReceiptDraftCopy.title, ReceiptDraftCopy.subtitle, ReceiptDraftCopy.manualTitle,
            ReceiptDraftCopy.manualSubtitle, ReceiptDraftCopy.save,
        ]

        for line in copy {
            let lowered = line.lowercased()
            for word in blaming {
                #expect(!lowered.contains(word), "\"\(line)\" frames editing as a rescue")
            }
        }
    }

    @Test("every field offers a prompt for what belongs in it")
    func everyFieldHasAPlaceholder() {
        let placeholders = [
            ReceiptDraftCopy.merchantPlaceholder, ReceiptDraftCopy.addressPlaceholder,
            ReceiptDraftCopy.datePlaceholder, ReceiptDraftCopy.amountPlaceholder,
            ReceiptDraftCopy.itemDescriptionPlaceholder,
            ReceiptDraftCopy.itemUnitNotePlaceholder,
        ]

        #expect(placeholders.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
    }

    /// VoiceOver says which row is about to go. "Remove" alone, repeated down
    /// a column, is the same announcement for every line.
    @Test("removing a row says which row")
    func removeNamesTheRow() {
        #expect(ReceiptDraftCopy.removeItem("Sourdough loaf").contains("Sourdough loaf"))
        #expect(!ReceiptDraftCopy.removeItem("").isEmpty)
    }
}
