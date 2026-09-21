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
