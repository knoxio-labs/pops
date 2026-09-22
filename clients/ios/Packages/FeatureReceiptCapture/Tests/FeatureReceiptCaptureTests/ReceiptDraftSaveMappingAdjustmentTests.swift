import AppCore
import Testing

@testable import FeatureReceiptCapture

/// Whether each adjustment is folded into the line prices, forwarded from
/// the form to the save payload (POPS-3651).
///
/// The review form shows at most one row per adjustment kind
/// (`ReceiptDraft.addableAdjustments`), so a kind's `isIncluded` is
/// unambiguous by construction — these tests exercise the forwarding, not
/// any reconciliation between rows of the same kind.
@Suite("Receipt draft save mapping: adjustment basis")
internal struct ReceiptDraftSaveMappingAdjustmentTests {
    @Test("a tax row marked included forwards taxIncluded true")
    func taxIncludedForwards() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        draft.addAdjustment(kind: .tax)
        draft.adjustments[0].amount.value = "1.00"
        draft.adjustments[0].isIncluded = true

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.taxIncluded == true)
    }

    @Test("a discount row left at its default forwards discountIncluded false")
    func discountDefaultsToFalse() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        draft.addAdjustment(kind: .discount)
        draft.adjustments[0].amount.value = "1.00"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.discountIncluded == false)
    }

    @Test("a shipping row marked included forwards shippingIncluded true")
    func shippingIncludedForwards() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        draft.addAdjustment(kind: .shipping)
        draft.adjustments[0].amount.value = "5.00"
        draft.adjustments[0].isIncluded = true

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.shippingIncluded == true)
    }

    @Test("no adjustment of a given kind forwards false and zero cents")
    func absentKindForwardsFalseAndZero() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.taxIncluded == false)
        #expect(payload.fields.discountIncluded == false)
        #expect(payload.fields.surchargeIncluded == false)
        #expect(payload.fields.shippingIncluded == false)
        #expect(payload.fields.taxCents == 0)
        #expect(payload.fields.discountCents == 0)
        #expect(payload.fields.surchargeCents == 0)
        #expect(payload.fields.shippingCents == 0)
    }

    @Test("every kind forwards its own basis independently")
    func everyKindForwardsIndependently() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        for kind in ReceiptDraftAdjustment.Kind.allCases {
            draft.addAdjustment(kind: kind)
        }
        for index in draft.adjustments.indices {
            draft.adjustments[index].amount.value = "1.00"
        }
        // Mark only tax and shipping as included.
        for index in draft.adjustments.indices
        where draft.adjustments[index].kind == .tax || draft.adjustments[index].kind == .shipping {
            draft.adjustments[index].isIncluded = true
        }

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.taxIncluded == true)
        #expect(payload.fields.discountIncluded == false)
        #expect(payload.fields.surchargeIncluded == false)
        #expect(payload.fields.shippingIncluded == true)
    }
}

/// What a line would have cost at list, forwarded with its provenance
/// (POPS-3652).
@Suite("Receipt draft save mapping: list price")
internal struct ReceiptDraftSaveMappingListPriceTests {
    @Test("an unedited, extracted list price saves as proposed")
    func extractedListPriceIsProposed() throws {
        let draft = ReceiptDraft.fake(.withListPriceAndShipping())

        let payload = try draft.toSavePayload(
            reading: ReceiptDraftReading(
                receiptUris: ["pops://purchases/receipt/x"], reconciled: true, failures: [],
                extracted: .withListPriceAndShipping(), capture: nil),
            idempotencyKey: "key"
        )

        #expect(payload.fields.items.first?.listPriceCents == 550)
        #expect(payload.fields.items.first?.listPriceAsserted == false)
    }

    @Test("editing an extracted list price saves as asserted")
    func editedListPriceIsAsserted() throws {
        var draft = ReceiptDraft.fake(.withListPriceAndShipping())
        draft.lines[0].listPrice.value = "6.00"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.items.first?.listPriceCents == 600)
        #expect(payload.fields.items.first?.listPriceAsserted == true)
    }

    @Test("a list price typed on a hand-added line saves as asserted")
    func handTypedListPriceIsAsserted() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        draft.lines[0].listPrice.value = "12.00"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.items.first?.listPriceCents == 1200)
        #expect(payload.fields.items.first?.listPriceAsserted == true)
    }

    @Test("no stated list price saves as nil, unasserted")
    func absentListPriceSavesAsNil() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.items.first?.listPriceCents == nil)
        #expect(payload.fields.items.first?.listPriceAsserted == false)
    }

    /// The figure is checked against nothing, unlike every other amount in
    /// this file — so an unparseable list price must not block the save.
    @Test("an unparseable list price is dropped rather than blocking the save")
    func unparseableListPriceIsDropped() throws {
        var draft = ReceiptDraft.blank(currency: "AUD")
        draft.merchantResolution = .chosen(id: "ent-kmart")
        draft.date.value = "2026-08-01"
        draft.total.value = "10.00"
        draft.lines[0].amount.value = "10.00"
        draft.lines[0].listPrice.value = "not a number"

        let payload = try draft.toManualPayload(idempotencyKey: "key")

        #expect(payload.fields.items.first?.listPriceCents == nil)
    }
}
