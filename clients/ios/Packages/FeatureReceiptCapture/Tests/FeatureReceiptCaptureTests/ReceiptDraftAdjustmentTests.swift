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

    /// GST sits inside the marked price on an Australian receipt, so that is
    /// the assumption the form opens with. It is still an assumption — the
    /// extractor is never told which convention it read — which is the whole
    /// reason the toggle exists.
    @Test("tax opens as included and the rest do not")
    func taxDefaultsToIncluded() {
        let draft = ReceiptDraft.fake(.withEveryAdjustment)

        let byKind = Dictionary(
            grouping: draft.adjustments, by: \.kind
        ).compactMapValues(\.first)

        #expect(byKind[.tax]?.isIncluded == true)
        #expect(byKind[.discount]?.isIncluded == false)
        #expect(byKind[.surcharge]?.isIncluded == false)
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

    // MARK: what it would have cost

    @Test("a list price is empty until somebody types one, and is not from the paper")
    func listPriceStartsEmpty() {
        let draft = ReceiptDraft.fake(tillNames)

        for line in draft.lines {
            #expect(line.listPrice.isEmpty)
            #expect(line.listPrice.wasExtracted == false)
        }
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

    // MARK: who it was from

    /// There is no way to type a merchant, so the only unresolved state is
    /// one nobody has answered — and it stops a save, because a purchase
    /// attributed to nothing is what this model exists to prevent.
    @Test("a purchase with no merchant cannot be saved")
    func unresolvedMerchantBlocksSave() {
        var draft = ReceiptDraft.fake(tillNames)

        #expect(draft.merchantResolution == .unresolved)
        #expect(draft.problems.contains(.merchantUnresolved))
        #expect(draft.isSaveable == false)

        draft.merchantResolution = .chosen(id: "ent-kmart")

        #expect(draft.problems.contains(.merchantUnresolved) == false)
        #expect(draft.isSaveable)
    }

    /// A merchant being created has no id yet — the save mints it — and that
    /// is still a resolved merchant, because the purchase will be attributed
    /// to something. Treating it as unresolved would refuse the save that
    /// creates it.
    @Test("a merchant being created resolves without an id")
    func createdMerchantIsResolvedWithoutAnID() {
        var draft = ReceiptDraft.fake(tillNames)

        draft.merchantResolution = .created(value: "Tongli Supermarket")

        #expect(draft.merchantResolution.isResolved)
        #expect(draft.merchantResolution.entityID == nil)
        #expect(draft.merchantResolution.createdValue == "Tongli Supermarket")
        #expect(draft.problems.contains(.merchantUnresolved) == false)
    }

    /// An address is descriptive where a merchant is operative — nothing keys
    /// on a branch — so an unanswered one must not hold the save.
    @Test("an unresolved address does not block a save")
    func unresolvedAddressDoesNotBlock() {
        var draft = ReceiptDraft.fake(tillNames)
        draft.merchantResolution = .chosen(id: "ent-kmart")

        #expect(draft.addressResolution == .unresolved)
        #expect(draft.isSaveable)
    }

    /// The handset resolves nothing itself. Whatever the server matched
    /// arrives with the reading, and until POPS-3654 sends it the reading
    /// carries no entity at all.
    @Test("a reading arrives unresolved until the server sends its match")
    func readingArrivesUnresolved() {
        let draft = ReceiptDraft.fake(tillNames)

        #expect(draft.merchantResolution == .unresolved)
        #expect(draft.merchantResolution.isConfirmed == false)
    }

    /// A match is a proposal and a pick is an assertion. Presenting them
    /// identically would collect agreement nobody gave, which is the whole
    /// reason this is three states and not an optional id.
    @Test(
        "only a picked merchant counts as settled",
        arguments: [
            (RecordResolution.matched(id: "ent-bunnings"), false),
            (.chosen(id: "ent-bunnings"), true),
            (.created(value: "Tongli Supermarket"), true),
            (.unresolved, false),
        ]
    )
    func onlyAPickIsConfirmed(resolution: RecordResolution, expected: Bool) {
        #expect(resolution.isConfirmed == expected)
    }

    @Test("a match and a pick both carry the id; typing carries none")
    func idSurvivesEitherWay() {
        #expect(RecordResolution.matched(id: "ent-aldi").entityID == "ent-aldi")
        #expect(RecordResolution.chosen(id: "ent-aldi").entityID == "ent-aldi")
        #expect(RecordResolution.created(value: "Aldi").entityID == nil)
        #expect(RecordResolution.unresolved.entityID == nil)
    }
}
