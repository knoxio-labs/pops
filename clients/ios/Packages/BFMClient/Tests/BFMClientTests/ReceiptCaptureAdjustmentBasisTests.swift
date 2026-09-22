import AppCore
import Testing

@testable import BFMClient

/// The adjustment-basis flags forwarded on the two save/manual bodies, and
/// read back off the extract response (POPS-3651). Built directly through
/// the mapping functions rather than through the stubbed HTTP round trip:
/// what matters here is whether the flags survive the boundary, not the
/// transport. Split out of `ReceiptCaptureMappingTests.swift` to keep that
/// file under the line-count cap.
@Suite("BFMReceiptCaptureRepository — adjustment basis")
internal struct ReceiptCaptureAdjustmentBasisTests {
    @Test("saveDraftBody forwards all four flags")
    func saveDraftBodyForwardsBasis() {
        let payload = ReceiptDraftSavePayload.fake(
            fields: .fake(
                taxIncluded: true,
                discountIncluded: false,
                surchargeIncluded: false,
                shippingIncluded: true
            )
        )

        let body = BFMReceiptCaptureRepository.saveDraftBody(from: payload)

        #expect(body.taxIncluded == true)
        #expect(body.discountIncluded == false)
        #expect(body.surchargeIncluded == false)
        #expect(body.shippingIncluded == true)
    }

    @Test("manualBody forwards all four flags")
    func manualBodyForwardsBasis() {
        let payload = ReceiptManualPurchasePayload(
            fields: .fake(
                taxIncluded: true,
                discountIncluded: false,
                surchargeIncluded: false,
                shippingIncluded: true
            )
        )

        let body = BFMReceiptCaptureRepository.manualBody(from: payload)

        #expect(body.taxIncluded == true)
        #expect(body.discountIncluded == false)
        #expect(body.surchargeIncluded == false)
        #expect(body.shippingIncluded == true)
    }

    @Test("a field left at its fixture default forwards false, not a fabricated true")
    func defaultedFieldsForwardFalse() {
        let payload = ReceiptDraftSavePayload.fake(fields: .fake())

        let body = BFMReceiptCaptureRepository.saveDraftBody(from: payload)

        #expect(body.taxIncluded == false)
        #expect(body.shippingIncluded == false)
    }

    @Test(
        "saveDraftBody sends a resolved merchant and address, and drops merchantName (ADR-053, POPS-4326)"
    )
    func saveDraftBodySendsResolvedMerchantAndAddress() {
        let payload = ReceiptDraftSavePayload.fake(
            fields: .fake(
                merchantName: "Bunnings Warehouse",
                merchantEntityId: "entity-1",
                merchantAddressId: "addr-1",
                merchantAddressText: "12 Example St, Sydney"
            )
        )

        let body = BFMReceiptCaptureRepository.saveDraftBody(from: payload)

        #expect(body.merchantEntityId == "entity-1")
        #expect(body.merchantAddressId == "addr-1")
        #expect(body.merchantAddressName == "12 Example St, Sydney")
        #expect(body.merchantName == nil)
    }

    @Test("saveDraftBody falls back to merchantName when no entity was resolved or picked")
    func saveDraftBodyFallsBackToMerchantName() {
        let payload = ReceiptDraftSavePayload.fake(
            fields: .fake(merchantName: "Corner Store", merchantEntityId: nil)
        )

        let body = BFMReceiptCaptureRepository.saveDraftBody(from: payload)

        #expect(body.merchantName == "Corner Store")
        #expect(body.merchantEntityId == nil)
    }

    @Test(
        "manualBody sends a resolved merchant and address, and drops merchantName (ADR-053, POPS-4326)"
    )
    func manualBodySendsResolvedMerchantAndAddress() {
        let payload = ReceiptManualPurchasePayload(
            fields: .fake(
                merchantName: "Bunnings Warehouse",
                merchantEntityId: "entity-1",
                merchantAddressId: "addr-1",
                merchantAddressText: "12 Example St, Sydney"
            )
        )

        let body = BFMReceiptCaptureRepository.manualBody(from: payload)

        #expect(body.merchantEntityId == "entity-1")
        #expect(body.merchantAddressId == "addr-1")
        #expect(body.merchantAddressName == "12 Example St, Sydney")
        #expect(body.merchantName == nil)
    }

    @Test("manualBody falls back to merchantName when no entity was resolved or picked")
    func manualBodyFallsBackToMerchantName() {
        let payload = ReceiptManualPurchasePayload(
            fields: .fake(merchantName: "Corner Store", merchantEntityId: nil)
        )

        let body = BFMReceiptCaptureRepository.manualBody(from: payload)

        #expect(body.merchantName == "Corner Store")
        #expect(body.merchantEntityId == nil)
    }

    @Test("extract carries a stated basis for all four flags")
    func extractCarriesBasis() async throws {
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(
                taxIncluded: true,
                discountIncluded: false,
                surchargeIncluded: false,
                shippingIncluded: true
            )
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.extracted.taxIncluded == true)
        #expect(reading.extracted.discountIncluded == false)
        #expect(reading.extracted.surchargeIncluded == false)
        #expect(reading.extracted.shippingIncluded == true)
    }

    @Test("an unstated basis reads as false, never a fabricated true")
    func extractDefaultsUnstatedBasisToFalse() async throws {
        let outcome = try await extractReceipt(json: ReceiptCaptureWire.draft())

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.extracted.taxIncluded == false)
        #expect(reading.extracted.shippingIncluded == false)
    }
}

/// The list-price field on a line, forwarded on both the request and the
/// response side (POPS-3652).
@Suite("BFMReceiptCaptureRepository — list price")
internal struct ReceiptCaptureListPriceTests {
    @Test("saveDraftItem forwards a line's list price and its assertion")
    func saveDraftItemForwardsListPrice() {
        let line = ReceiptSaveLine.fake(listPriceCents: 550, listPriceAsserted: true)

        let item = BFMReceiptCaptureRepository.saveDraftItem(from: line)

        #expect(item.listPriceCents == 550)
        #expect(item.listPriceAsserted == true)
    }

    @Test("manualItem forwards a line's list price and its assertion")
    func manualItemForwardsListPrice() {
        let line = ReceiptSaveLine.fake(listPriceCents: 550, listPriceAsserted: true)

        let item = BFMReceiptCaptureRepository.manualItem(from: line)

        #expect(item.listPriceCents == 550)
        #expect(item.listPriceAsserted == true)
    }

    @Test("extract maps a wire list price into a formatted printed amount")
    func extractCarriesListPrice() async throws {
        let items = """
            [{"name":"Timber Pine DAR 42x19","quantity":null,"unitPriceCents":350,\
            "lineTotalCents":350,"notes":[],"listPriceCents":550}]
            """
        let outcome = try await extractReceipt(
            json: ReceiptCaptureWire.draft(taxIncluded: true, shippingIncluded: true, items: items)
        )

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.extracted.taxIncluded == true)
        #expect(reading.extracted.shippingIncluded == true)
        #expect(reading.extracted.lines.first?.listAmount == "5.50")
    }

    @Test("a wire list price of null maps to nil, never a fabricated $0.00")
    func extractMapsNullListPriceToNil() async throws {
        let outcome = try await extractReceipt(json: ReceiptCaptureWire.draft())

        guard case .draft(let reading) = outcome else {
            Issue.record("expected .draft, got \(outcome)")
            return
        }
        #expect(reading.extracted.lines.first?.listAmount == nil)
    }
}
