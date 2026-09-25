import AppCore
import Foundation

extension PurchaseAccounting {
    /// Creates an accounting split in one currency from minor-unit figures; `netSpend` is derived
    /// as `total - refunded`, the identity the server guarantees.
    public static func fake(
        total: Int = 500,
        matched: Int = 0,
        awaitingImport: Int = 500,
        residual: Int = 0,
        refunded: Int = 0,
        currencyCode: String = "AUD"
    ) -> PurchaseAccounting {
        func money(_ minorUnits: Int) -> MoneyAmount {
            MoneyAmount(minorUnits: minorUnits, currencyCode: currencyCode)
        }
        return PurchaseAccounting(
            total: money(total),
            matched: money(matched),
            awaitingImport: money(awaitingImport),
            residual: money(residual),
            refunded: money(refunded),
            netSpend: money(total - refunded))
    }
}

extension MatchedBankTransaction {
    /// Creates a described bank transaction fixture.
    public static func fake(
        description: String = "FAKE MERCHANT 1234",
        date: Date = Date(timeIntervalSince1970: 1_756_771_200),
        amount: MoneyAmount = MoneyAmount(minorUnits: -500, currencyCode: "AUD"),
        accountName: String? = "Everyday"
    ) -> MatchedBankTransaction {
        MatchedBankTransaction(
            description: description, date: date, amount: amount, accountName: accountName)
    }
}

extension PurchaseChargeMatch {
    /// Creates a charge match fixture.
    public static func fake(
        id: String = "link-1",
        amount: MoneyAmount = MoneyAmount(minorUnits: 500, currencyCode: "AUD"),
        method: PurchaseMatchMethod = .automatic,
        transaction: MatchedBankTransaction? = .fake()
    ) -> PurchaseChargeMatch {
        PurchaseChargeMatch(
            id: id, transactionID: "tx-\(id)", amount: amount, method: method,
            transaction: transaction)
    }
}

extension PurchaseCharge {
    /// Creates a capture charge fixture stated by the merchant.
    public static func fake(
        id: String = "charge-1",
        amount: MoneyAmount = MoneyAmount(minorUnits: 500, currencyCode: "AUD"),
        chargedOn: Date? = nil,
        matches: [PurchaseChargeMatch] = []
    ) -> PurchaseCharge {
        PurchaseCharge(
            id: id, amount: amount, role: "capture", origin: "merchant", chargedOn: chargedOn,
            matches: matches)
    }
}
