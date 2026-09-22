import AppCore
import AppCoreFakes
import Testing

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
}
