import AppCore
import AppCoreFakes
import HTTPTypes
import Testing

@testable import BFMClient

/// `saveDraft` and `createManualPurchase`, mapped — the two calls that
/// actually write a purchase (POPS-2454).
///
/// Both answer the same `MobilePurchaseDetail` shape, so one suite covers
/// both; `ReceiptRequestMappingTests` covers what each call sends.
@Suite("BFMReceiptCaptureRepository write mapping")
internal struct ReceiptCreatedMappingTests {
    @Test("a saved draft carries the summary a confirmation is drawn from")
    func savedDraft() async throws {
        let purchase = try await saveDraft(
            json: ReceiptCaptureWire.purchaseDetail(
                id: "purchase-42",
                merchantName: "Woolworths",
                totalCents: 8420,
                currency: "AUD",
                orderedAt: "2026-03-05T10:00:00.000Z",
                itemCount: 12
            )
        )

        #expect(
            purchase
                == ReceiptPurchase(
                    id: "purchase-42",
                    merchantName: "Woolworths",
                    total: MoneyAmount(minorUnits: 8420, currencyCode: "AUD"),
                    orderedAt: "2026-03-05T10:00:00.000Z",
                    itemCount: 12
                )
        )
    }

    /// A merchant the pillar could not resolve stays unresolved rather than
    /// becoming a label nobody read off the paper.
    @Test("no field of the wire's purchase is dropped at the mapping boundary")
    func savedDraftKeepsEveryPublishedField() async throws {
        let purchase = try await saveDraft(
            json: ReceiptCaptureWire.purchaseDetail(
                merchantName: nil, totalCents: 199, currency: "AUD", itemCount: 0))

        #expect(purchase.merchantName == nil)
        #expect(purchase.total.minorUnits == 199)
        #expect(purchase.total.currencyCode == "AUD")
        #expect(purchase.itemCount == 0)
    }

    @Test("a manual purchase maps through the same field set")
    func manualPurchase() async throws {
        let purchase =
            try await BFMReceiptCaptureRepository
            .stubbed(
                StubTransport(
                    status: .ok,
                    json: ReceiptCaptureWire.purchaseDetail(
                        id: "purchase-manual-1", totalCents: 500, itemCount: 1))
            )
            .createManualPurchase(.fake())

        #expect(purchase.id == "purchase-manual-1")
        #expect(purchase.total.minorUnits == 500)
        #expect(purchase.itemCount == 1)
    }
}
