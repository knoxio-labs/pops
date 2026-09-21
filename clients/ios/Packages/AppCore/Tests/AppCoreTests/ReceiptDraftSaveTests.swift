import AppCore
import AppCoreFakes
import Testing

/// `ReceiptDraftReading.matchedMerchantEntityID` and
/// `ReceiptPurchaseDraftFields`'s merchant-entity/address fields (POPS-3858)
/// carry a server-side merchant match — or a reviewer's own resolved pick —
/// through the two types a receipt-derived save is built from.
@Suite("ReceiptDraftSave merchant fields")
internal struct ReceiptDraftSaveTests {
    @Test("ReceiptDraftReading round-trips a matched merchant entity id")
    func draftReadingCarriesMatchedMerchant() {
        let reading = ReceiptDraftReading(
            receiptUris: ["pops://purchases/receipt/fake"],
            reconciled: true,
            failures: [],
            extracted: .fake(),
            capture: nil,
            matchedMerchantEntityID: "entity-bunnings"
        )

        #expect(reading.matchedMerchantEntityID == "entity-bunnings")
    }

    @Test("ReceiptDraftReading defaults to no match")
    func draftReadingDefaultsToNoMatch() {
        let reading = ReceiptDraftReading(
            receiptUris: ["pops://purchases/receipt/fake"],
            reconciled: true,
            failures: [],
            extracted: .fake(),
            capture: nil
        )

        #expect(reading.matchedMerchantEntityID == nil)
    }

    @Test("ReceiptPurchaseDraftFields round-trips a resolved merchant entity and address")
    func draftFieldsCarryResolvedMerchant() {
        let fields = ReceiptPurchaseDraftFields(
            merchantName: "Bunnings Warehouse",
            merchantEntityId: "entity-bunnings",
            merchantAddressId: "address-1",
            merchantAddressText: "123 Example St, Sydney NSW 2000",
            orderedAt: "2026-08-01T14:32:00+10:00",
            currency: "AUD",
            totalCents: 2750,
            taxCents: nil,
            surchargeCents: nil,
            shippingCents: nil,
            discountCents: nil,
            taxIncluded: false,
            discountIncluded: false,
            surchargeIncluded: false,
            shippingIncluded: false,
            items: [],
            capture: nil,
            idempotencyKey: "key-1"
        )

        #expect(fields.merchantEntityId == "entity-bunnings")
        #expect(fields.merchantAddressId == "address-1")
        #expect(fields.merchantAddressText == "123 Example St, Sydney NSW 2000")
    }

    @Test("ReceiptPurchaseDraftFields leaves the merchant unresolved by default")
    func draftFieldsDefaultToUnresolvedMerchant() {
        let fields = ReceiptPurchaseDraftFields(
            merchantName: "Corner Store",
            orderedAt: "2026-08-01T09:00:00+10:00",
            currency: "AUD",
            totalCents: 500,
            taxCents: nil,
            surchargeCents: nil,
            shippingCents: nil,
            discountCents: nil,
            taxIncluded: false,
            discountIncluded: false,
            surchargeIncluded: false,
            shippingIncluded: false,
            items: [],
            capture: nil,
            idempotencyKey: "key-2"
        )

        #expect(fields.merchantEntityId == nil)
        #expect(fields.merchantAddressId == nil)
        #expect(fields.merchantAddressText == nil)
    }
}
