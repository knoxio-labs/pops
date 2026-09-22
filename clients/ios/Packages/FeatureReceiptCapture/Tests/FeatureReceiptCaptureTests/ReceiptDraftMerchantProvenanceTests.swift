import AppCore
import Testing

@testable import FeatureReceiptCapture

/// Who a purchase was from, and the difference between a match, a pick and a
/// name typed by hand. Split out of `ReceiptDraftAdjustmentTests.swift` to
/// keep that file under the line-count cap — the two files together are
/// still what that file's own doc comment describes: the form's arithmetic
/// and provenance claims.
@Suite("Merchant provenance")
internal struct ReceiptDraftMerchantProvenanceTests {
    private var tillNames: ExtractedReceipt { .tillNamedItems() }

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
