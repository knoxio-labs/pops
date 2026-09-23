import AppCore
import AppCoreFakes
import Testing

@Suite("Purchase edits")
internal struct PurchaseEditTests {
    @Test("unknown server fields remain available to newer presentation code")
    func unrecognisedField() {
        #expect(PurchaseEditField(wire: "tip") == .unrecognised("tip"))
    }

    @Test("an unedited detail defaults its edit record to nil")
    func detailDefaultsToNoEdit() {
        #expect(PurchaseDetail.fake().edit == nil)
    }

    @Test("the update token remains exactly as the server supplied it")
    func updateTokenIsVerbatim() {
        let token = "2026-09-22T01:02:03.123456+10:00"

        #expect(PurchaseDetail.fake(updatedAt: token).updatedAt == token)
    }
}
