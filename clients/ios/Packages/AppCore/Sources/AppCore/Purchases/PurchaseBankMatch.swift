import Foundation

/// How much of a purchase the bank statements have proven, as the purchases pillar splits it.
///
/// `total == matched + awaitingImport + residual` always holds. `awaitingImport` is money whose
/// statement has not been imported yet, which is normal for a recent purchase; `residual` is money
/// nothing explains. `refunded` is orthogonal, and `netSpend` is `total - refunded`.
public struct PurchaseAccounting: Hashable, Sendable {
    public let total: MoneyAmount
    public let matched: MoneyAmount
    public let awaitingImport: MoneyAmount
    public let residual: MoneyAmount
    /// A positive magnitude: money that came back.
    public let refunded: MoneyAmount
    public let netSpend: MoneyAmount

    /// Creates an accounting split; every amount shares the purchase's currency.
    public init(
        total: MoneyAmount,
        matched: MoneyAmount,
        awaitingImport: MoneyAmount,
        residual: MoneyAmount,
        refunded: MoneyAmount,
        netSpend: MoneyAmount
    ) {
        self.total = total
        self.matched = matched
        self.awaitingImport = awaitingImport
        self.residual = residual
        self.refunded = refunded
        self.netSpend = netSpend
    }

    /// The part of the total no matched transaction accounts for yet: awaiting import plus
    /// unexplained residual.
    public var unmatched: MoneyAmount {
        MoneyAmount(
            minorUnits: awaitingImport.minorUnits + residual.minorUnits,
            currencyCode: total.currencyCode)
    }
}

/// How a charge came to be matched to a bank transaction.
public enum PurchaseMatchMethod: Hashable, Sendable {
    /// The reconcile sweep matched it and no person has reviewed it.
    case automatic
    /// A person accepted or made the match.
    case confirmed
}

/// The bank transaction a match points at, as the finance pillar describes it.
public struct MatchedBankTransaction: Hashable, Sendable {
    /// The statement descriptor, verbatim.
    public let description: String
    /// The statement day, at midnight in the time zone the repository resolves days in.
    public let date: Date
    /// The transaction's own amount, in finance's sign convention. It can differ from the
    /// match's amount when one transaction pays several charges.
    public let amount: MoneyAmount
    /// The account's display name, when finance supplied one.
    public let accountName: String?

    /// Creates a described bank transaction.
    public init(description: String, date: Date, amount: MoneyAmount, accountName: String?) {
        self.description = description
        self.date = date
        self.amount = amount
        self.accountName = accountName
    }
}

/// One link between a purchase charge and a bank transaction.
///
/// `transaction` is `nil` when finance could not describe the transaction; the match still
/// carries the amount it accounts for and how it was made.
public struct PurchaseChargeMatch: Identifiable, Hashable, Sendable {
    public let id: String
    public let transactionID: String?
    /// How much of the charge this match accounts for.
    public let amount: MoneyAmount
    public let method: PurchaseMatchMethod
    public let transaction: MatchedBankTransaction?

    /// Creates a charge match.
    public init(
        id: String,
        transactionID: String?,
        amount: MoneyAmount,
        method: PurchaseMatchMethod,
        transaction: MatchedBankTransaction?
    ) {
        self.id = id
        self.transactionID = transactionID
        self.amount = amount
        self.method = method
        self.transaction = transaction
    }
}

/// One payment a purchase expects to see on a statement, and the transactions matched to it.
///
/// `role` and `origin` are the purchases pillar's open vocabularies, kept verbatim.
public struct PurchaseCharge: Identifiable, Hashable, Sendable {
    public let id: String
    public let amount: MoneyAmount
    /// `capture`, `authorization`, `refund` or `adjustment`, or a value this build does not know.
    public let role: String
    /// `merchant` when the source stated the charge, `derived` when the pillar inferred it.
    public let origin: String
    /// The day the merchant charged, when the source stated one.
    public let chargedOn: Date?
    /// Oldest first; empty for a charge nothing has matched.
    public let matches: [PurchaseChargeMatch]

    /// Creates a charge with its matches.
    public init(
        id: String,
        amount: MoneyAmount,
        role: String,
        origin: String,
        chargedOn: Date?,
        matches: [PurchaseChargeMatch]
    ) {
        self.id = id
        self.amount = amount
        self.role = role
        self.origin = origin
        self.chargedOn = chargedOn
        self.matches = matches
    }
}
