import AppCore
import Testing

@testable import FeatureReceiptCapture

/// The form gained four things a reading cannot supply: whether an adjustment
/// is inside the line prices, an adjustment the reading never found, what a
/// line would have cost at list, and a merchant resolved to an entity rather
/// than typed.
///
/// Each is a claim about arithmetic or provenance rather than about layout,
/// which is why they are tested here and not through a rendering.
@Suite("Draft adjustments and provenance")
internal struct ReceiptDraftAdjustmentTests {
    private var tillNames: ExtractedReceipt { .tillNamedItems() }

    // MARK: whether it is included

    /// Each row's basis comes from the receipt's own gate verdict — a fact
    /// the reading stated, not a hardcoded guess. `.withEveryAdjustment`
    /// states all four as included, and each row must say so.
    @Test("each row's basis comes from what the reading actually stated")
    func rowBasisComesFromTheReading() {
        let draft = ReceiptDraft.fake(.withEveryAdjustment)

        let byKind = Dictionary(
            grouping: draft.adjustments, by: \.kind
        ).compactMapValues(\.first)

        #expect(byKind[.tax]?.isIncluded == true)
        #expect(byKind[.discount]?.isIncluded == true)
        #expect(byKind[.surcharge]?.isIncluded == true)
        #expect(byKind[.shipping]?.isIncluded == true)
    }

    /// The exclusive convention is exactly as real as the inclusive one, and
    /// a hardcoded `true` on the tax row would misreport it.
    @Test("a row reads not-included when the reading said so")
    func rowBasisReadsExclusive() {
        let extracted = ExtractedReceipt(
            merchantName: "ALDI", address: nil, purchasedOn: nil, purchasedAt: nil,
            currency: "AUD", total: "42.03", tax: "3.82", discounts: [], surcharges: [],
            shipping: "9.95", lines: [], unreadableNotes: [],
            taxIncluded: false, discountIncluded: false, surchargeIncluded: false,
            shippingIncluded: false)
        let draft = ReceiptDraft.fake(extracted)

        let byKind = Dictionary(
            grouping: draft.adjustments, by: \.kind
        ).compactMapValues(\.first)

        #expect(byKind[.tax]?.isIncluded == false)
        #expect(byKind[.shipping]?.isIncluded == false)
    }

    /// The subtle one. Toggling the basis changes no figure at all and
    /// changes the arithmetic the gate's verdict was about, so a
    /// reconciliation that survived it would be the screen vouching for a sum
    /// computed on the other assumption.
    @Test("changing the basis withdraws the reconciliation, without changing a figure")
    func togglingIncludedInvalidatesReconciliation() {
        var draft = ReceiptDraft.fake(.withEveryAdjustment)
        #expect(draft.reconciliation == .reconciledAsRead)
        let before = draft.adjustments.map(\.amount.value)

        draft.adjustments[0].isIncluded.toggle()

        #expect(draft.adjustments.map(\.amount.value) == before, "no figure should have moved")
        #expect(draft.adjustments[0].basisChanged)
        #expect(draft.amountsEdited)
        #expect(draft.reconciliation == .notRechecked)
    }

    @Test("toggling the basis back leaves it as read")
    func togglingBackIsNotAChange() {
        var draft = ReceiptDraft.fake(.withEveryAdjustment)

        draft.adjustments[0].isIncluded.toggle()
        draft.adjustments[0].isIncluded.toggle()

        #expect(draft.adjustments[0].basisChanged == false)
        #expect(draft.reconciliation == .reconciledAsRead)
    }

    // MARK: one the reading never found

    @Test("an added adjustment is not included, and is not from the paper")
    func addedAdjustmentIsHumanAndOnTop() {
        var draft = ReceiptDraft.fake(tillNames)

        draft.addAdjustment(kind: .surcharge)

        guard let added = draft.adjustments.last else {
            Issue.record("adding an adjustment produced none")
            return
        }
        #expect(added.kind == .surcharge)
        #expect(added.isIncluded == false)
        #expect(added.wasExtracted == false)
        #expect(added.amount.isEmpty)
    }

    /// A figure the reader added is a figure the reading did not account for,
    /// so the reconciliation the gate reported no longer describes what is on
    /// screen.
    @Test("adding an adjustment withdraws the reconciliation")
    func addingAnAdjustmentInvalidates() {
        var draft = ReceiptDraft.fake(.withEveryAdjustment)
        #expect(draft.reconciliation == .reconciledAsRead)

        draft.addAdjustment(kind: .shipping)

        #expect(draft.reconciliation == .notRechecked)
    }

    @Test("only the kinds not already on the form can be added")
    func addableExcludesWhatIsThere() {
        let full = ReceiptDraft.fake(.withEveryAdjustment)
        #expect(full.addableAdjustments.isEmpty)

        var empty = ReceiptDraft.blank()
        #expect(Set(empty.addableAdjustments) == Set(ReceiptDraftAdjustment.Kind.allCases))

        empty.addAdjustment(kind: .tax)
        #expect(empty.addableAdjustments.contains(.tax) == false)
        #expect(empty.addableAdjustments.count == ReceiptDraftAdjustment.Kind.allCases.count - 1)
    }

    @Test("an adjustment can be removed by id, and the others stay")
    func removeTakesOnlyTheOneNamed() {
        var draft = ReceiptDraft.fake(.withEveryAdjustment)
        let target = draft.adjustments[1]
        let survivors = draft.adjustments.filter { $0.id != target.id }.map(\.id)

        draft.removeAdjustment(id: target.id)

        #expect(draft.adjustments.map(\.id) == survivors)
    }

    /// A branch belongs to a merchant, so changing the merchant has to drop
    /// it. Nothing downstream would catch a stale one: the address select
    /// scopes its list to the new merchant and shows a placeholder, while the
    /// stored id is still the old merchant's — and an address is not gated on
    /// save, so it would be written.
    @Test("changing the merchant drops the branch that belonged to the old one")
    func switchingMerchantClearsTheBranch() {
        var draft = ReceiptDraft.fake(tillNames)
        draft.merchantResolution = .chosen(id: "ent-woolworths")
        draft.addressResolution = .chosen(id: "adr-woolworths-1")

        draft.setMerchant(.chosen(id: "ent-kmart"))

        #expect(draft.merchantResolution == .chosen(id: "ent-kmart"))
        #expect(
            draft.addressResolution == .unresolved,
            "a Woolworths branch survived onto a Kmart purchase")
    }

    /// Confirming the server's own match is not a change of merchant, so the
    /// branch it came with has to survive it.
    @Test("confirming the same merchant keeps the branch")
    func confirmingTheSameMerchantKeepsTheBranch() {
        var draft = ReceiptDraft.fake(tillNames)
        draft.merchantResolution = .matched(id: "ent-kmart")
        draft.addressResolution = .chosen(id: "adr-kmart-0")

        draft.setMerchant(.chosen(id: "ent-kmart"))

        #expect(draft.addressResolution == .chosen(id: "adr-kmart-0"))
    }

    @Test("switching to a merchant being created also drops the branch")
    func switchingToACreatedMerchantClearsTheBranch() {
        var draft = ReceiptDraft.fake(tillNames)
        draft.merchantResolution = .chosen(id: "ent-woolworths")
        draft.addressResolution = .chosen(id: "adr-woolworths-0")

        draft.setMerchant(.created(value: "Tongli Supermarket"))

        #expect(draft.addressResolution == .unresolved)
    }

    // MARK: what it would have cost

    @Test("a list price is empty until somebody types one, and is not from the paper")
    func listPriceStartsEmpty() {
        let draft = ReceiptDraft.fake(tillNames)

        for line in draft.lines {
            #expect(line.listPrice.isEmpty)
            #expect(line.listPrice.wasExtracted == false)
        }
    }

    @Test("a list price the reading stated arrives filled in and unedited")
    func listPriceArrivesFromTheReading() {
        let draft = ReceiptDraft.fake(.withListPriceAndShipping())

        let line = draft.lines.first
        #expect(line?.listPrice.value == "5.50")
        #expect(line?.listPrice.wasExtracted == true)
        #expect(line?.isEdited == false)
    }

    @Test("typing a list price is an edit, and does not touch what was paid")
    func listPriceIsAnEdit() {
        var draft = ReceiptDraft.fake(tillNames)
        let paid = draft.lines[0].amount.value

        draft.lines[0].listPrice.value = "5.50"

        #expect(draft.lines[0].isEdited)
        #expect(draft.isEdited)
        #expect(draft.lines[0].amount.value == paid, "the charged figure must not move")
    }

    /// It is not an amount, so it must not make the gate's verdict stale the
    /// way a charged figure does — the sum it checked did not involve it.
    @Test("a list price does not withdraw the reconciliation")
    func listPriceIsNotAnAmountEdit() {
        var draft = ReceiptDraft.fake(.withEveryAdjustment)
        #expect(draft.reconciliation == .reconciledAsRead)

        draft.lines[0].listPrice.value = "5.50"

        #expect(draft.reconciliation == .reconciledAsRead)
    }

    /// What decides whether a row opens showing its second tier. A line with
    /// nothing qualifying its price is the majority, and those stay shut.
    @Test(
        "a line reports qualifiers only when it has some",
        arguments: [
            (quantity: "", unitNote: "", listPrice: "", expected: false),
            (quantity: "2", unitNote: "", listPrice: "", expected: true),
            (quantity: "", unitNote: "$4.90/kg", listPrice: "", expected: true),
            (quantity: "", unitNote: "", listPrice: "5.50", expected: true),
        ]
    )
    func qualifiersAreReportedWhenPresent(
        quantity: String, unitNote: String, listPrice: String, expected: Bool
    ) {
        var draft = ReceiptDraft.blank()
        draft.addLine()
        draft.lines[0].quantity.value = quantity
        draft.lines[0].unitNote.value = unitNote
        draft.lines[0].listPrice.value = listPrice

        #expect(draft.lines[0].hasQualifiers == expected)
    }

    /// A row offered and not used must not make an untouched form look
    /// authored, and the new field must not be the thing that breaks that.
    @Test("a blank line stays blank when its list price is empty")
    func listPriceDoesNotUnblankARow() {
        var draft = ReceiptDraft.blank()
        draft.addLine()

        #expect(draft.lines[0].isBlank)

        draft.lines[0].listPrice.value = "5.50"
        #expect(draft.lines[0].isBlank == false)
    }
}
