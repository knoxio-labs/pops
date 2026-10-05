import Foundation
import Testing

@testable import BFMClient

@Suite("BFM mobile forbidden bodies")
internal struct MobileForbiddenBodyTests {
    @Test("inventory operations distinguish capability denial and revocation")
    func inventoryResponsesExposeBothRefusals() throws {
        try expectBothRefusals(
            Operations.MobileInventory_catalogue.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_catalogueRevision.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_snapshot.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_changes.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_item.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_itemHistory.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_mutations.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_suggestCodes.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_putMedia.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileInventory_getMedia.Output.Forbidden.Body.JsonPayload.self)
    }

    @Test("finance operations distinguish capability denial and revocation")
    func financeResponsesExposeBothRefusals() throws {
        try expectBothRefusals(
            Operations.Mobile_bootstrap.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileFinance_listAccounts.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileFinance_getAccount.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileFinance_listTransactions.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileFinance_getTransaction.Output.Forbidden.Body.JsonPayload.self)
    }

    @Test("purchase operations distinguish capability denial and revocation")
    func purchaseResponsesExposeBothRefusals() throws {
        try expectBothRefusals(
            Operations.MobilePurchases_extractReceipt.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_listPurchases.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_getMonthSummary.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_getPurchase.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_updatePurchase.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_searchPurchases.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_purchaseTags.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_getReceipt.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_getReceiptThumbnail.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_saveReceiptDraft.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobilePurchases_createManualPurchase.Output.Forbidden.Body.JsonPayload.self)
    }

    @Test("merchant and barcode operations distinguish capability denial and revocation")
    func merchantAndBarcodeResponsesExposeBothRefusals() throws {
        try expectBothRefusals(
            Operations.MobileContacts_searchMerchants.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileContacts_getMerchant.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileContacts_createMerchant.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileContacts_getMerchantAddresses.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileContacts_createMerchantAddress.Output.Forbidden.Body.JsonPayload.self)
        try expectBothRefusals(
            Operations.MobileBarcode_lookup.Output.Forbidden.Body.JsonPayload.self)
    }

    private func expectBothRefusals<Body: Decodable & WireForbiddenBody>(
        _ bodyType: Body.Type
    ) throws {
        let capabilityDenial = try JSONDecoder().decode(
            bodyType,
            from: Data(
                #"{"code":"capability_not_granted","message":"denied","capability":"purchases.read"}"#
                    .utf8
            )
        )
        let revocation = try JSONDecoder().decode(
            bodyType,
            from: Data(
                #"{"code":"bfm.auth.device_revoked","message":"revoked","requestId":"revocation-1","retryable":false}"#
                    .utf8
            )
        )

        #expect(BFMRepositoryFailure.forbiddenFailure(capabilityDenial) == .featureUnavailable)
        #expect(BFMRepositoryFailure.forbiddenFailure(revocation) == .unauthorized)
    }
}
