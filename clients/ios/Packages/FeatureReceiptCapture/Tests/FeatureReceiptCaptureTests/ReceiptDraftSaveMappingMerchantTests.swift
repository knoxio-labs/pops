import Testing

@testable import FeatureReceiptCapture

/// The name a saved purchase is sent with, now that the form points at
/// records the save payload has no room for.
///
/// The payload carries `merchantName` and nothing else. Getting this wrong in
/// either direction is quiet: sending the till's wording for a merchant the
/// reader created throws away the name they gave it, and sending nothing
/// files the purchase under no merchant at all.
@Suite("Receipt draft save mapping: merchant")
internal struct ReceiptDraftSaveMappingMerchantTests {
    @Test("an unresolved merchant is sent as the till printed it")
    func unresolvedSendsPrinted() throws {
        let draft = ReceiptDraft.fake(.tillNamedItems())

        #expect(draft.merchantResolution == .unresolved)
        let payload = try draft.toManualPayload(idempotencyKey: "key")
        #expect(payload.fields.merchantName == "Kmart Broadway")
    }

    @Test("a created merchant is sent by the name the reader gave it")
    func createdSendsItsName() throws {
        var draft = ReceiptDraft.fake(.tillNamedItems())
        draft.setMerchant(.created(value: "Kmart"))

        let payload = try draft.toManualPayload(idempotencyKey: "key")
        #expect(payload.fields.merchantName == "Kmart")
    }

    /// A record picked from contacts has an id the payload cannot carry. The
    /// printed wording is what the pillar resolves against, so that is what
    /// goes until the id can.
    @Test("a chosen or matched merchant is sent as the till printed it")
    func chosenAndMatchedSendPrinted() {
        var chosen = ReceiptDraft.fake(.tillNamedItems())
        chosen.setMerchant(.chosen(id: "ent-kmart"))
        var matched = ReceiptDraft.fake(.tillNamedItems())
        matched.setMerchant(.matched(id: "ent-kmart"))

        #expect(chosen.merchantNameForSave == "Kmart Broadway")
        #expect(matched.merchantNameForSave == "Kmart Broadway")
    }

    @Test("nothing printed and nothing created sends no name")
    func nothingSendsNoName() {
        #expect(ReceiptDraft.blank(currency: nil).merchantNameForSave == nil)
    }
}
