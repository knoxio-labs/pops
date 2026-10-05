/// A `403` body: `bfm.auth.device_revoked` (`case1`, no extra data) or
/// `capability_not_granted` (`case2`, naming the capability). One protocol
/// lets every operation's own `Forbidden.Body.JsonPayload` type be read the
/// same way despite each being distinct (ADR-033).
internal protocol WireForbiddenBody {
    var capabilityNotGranted: String? { get }
}

extension Operations.MobileInventory_catalogue.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_catalogueRevision.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_snapshot.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_changes.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_item.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_mutations.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_suggestCodes.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_putMedia.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_getMedia.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.Mobile_bootstrap.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileFinance_listTransactions.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileFinance_getTransaction.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_extractReceipt.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileFinance_listAccounts.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileFinance_getAccount.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_listPurchases.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_getMonthSummary.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_getPurchase.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_updatePurchase.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_searchPurchases.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_purchaseTags.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_getReceipt.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_getReceiptThumbnail.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_saveReceiptDraft.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobilePurchases_createManualPurchase.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileContacts_searchMerchants.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileContacts_getMerchant.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileContacts_createMerchant.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileContacts_getMerchantAddresses.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileContacts_createMerchantAddress.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileBarcode_lookup.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}
