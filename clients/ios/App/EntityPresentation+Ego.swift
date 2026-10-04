import FeatureAccounts
import FeatureInventory
import FeaturePurchases
import FeatureTransactions

extension EntityPresentation {
    /// The canonical object URI currently presented by the app, if any.
    internal var presentedObjectURI: String? {
        if let inventory {
            switch inventory {
            case .item(let id): "pops:inventory/item/\(id)"
            case .location(let id): "pops:inventory/location/\(id)"
            }
        } else if let transaction {
            "pops:finance/transaction/\(transaction.transactionId)"
        } else if let account {
            "pops:finance/account/\(account.accountId)"
        } else if let purchase {
            "pops:purchases/purchase/\(purchase.purchaseId)"
        } else {
            nil
        }
    }
}
