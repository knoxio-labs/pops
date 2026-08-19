import AppCore
import Testing

/// The `created` arm of `POST /mobile/purchases/receipts`, mapped.
///
/// Its own suite because it is the only arm carrying a record the purchases
/// pillar actually wrote — the other two carry a reading nobody has agreed
/// with yet, and what has to survive the boundary is a different set of
/// fields entirely.
@Suite("BFMReceiptCaptureRepository created mapping")
internal struct ReceiptCreatedMappingTests {
    @Test("a created purchase carries the summary a confirmation is drawn from")
    func createdOutcome() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.created(
                id: "purchase-42",
                merchantName: "Woolworths",
                totalCents: 8420,
                currency: "AUD",
                orderedAt: "2026-03-05T10:00:00.000Z",
                itemCount: 12,
                alreadyStored: true
            )
        )

        #expect(
            outcome
                == .created(
                    purchase: ReceiptPurchase(
                        id: "purchase-42",
                        merchantName: "Woolworths",
                        total: MoneyAmount(minorUnits: 8420, currencyCode: "AUD"),
                        orderedAt: "2026-03-05T10:00:00.000Z",
                        itemCount: 12
                    ),
                    alreadyStored: true
                )
        )
    }

    /// Every one of these fields is on the wire. The assertion is that none of
    /// them is dropped here, which is the only place they could be — a
    /// confirmation screen cannot draw what the mapping already threw away.
    @Test("no field of the wire's purchase is dropped at the mapping boundary")
    func createdKeepsEveryPublishedField() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.created(
                merchantName: nil, totalCents: 199, currency: "AUD", itemCount: 0))

        guard case .created(let purchase, _) = outcome else {
            Issue.record("expected .created, got \(outcome)")
            return
        }
        // A merchant the pillar could not resolve stays unresolved rather than
        // becoming a label nobody read off the paper.
        #expect(purchase.merchantName == nil)
        #expect(purchase.total.minorUnits == 199)
        #expect(purchase.total.currencyCode == "AUD")
        #expect(purchase.itemCount == 0)
    }

    /// The one field a fresh upload and a re-upload of the same bytes must
    /// still disagree on — a duplicate purchase silently created twice is the
    /// failure this field exists to prevent.
    @Test("a first-time upload is not mistaken for a re-upload")
    func createdNotAlreadyStored() async throws {
        let outcome = try await captureReceipt(
            json: ReceiptCaptureWire.created(alreadyStored: false))

        guard case .created(_, let alreadyStored) = outcome else {
            Issue.record("expected .created, got \(outcome)")
            return
        }
        #expect(alreadyStored == false)
    }
}
