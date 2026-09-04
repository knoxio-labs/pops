import Foundation

/// One account, in the app's own vocabulary rather than the wire's.
///
/// Mirrors ``Transaction``'s reason for existing as its own type: a feature is
/// written against this and never against a generated one, so the contract can
/// move without a feature noticing.
public struct Account: Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let kind: AccountKind
    /// Minor units, signed in the account's own terms — a credit card's
    /// positive balance is money owed, a person ledger's positive balance is
    /// owed to you. The currency travels with the amount.
    public let balance: MoneyAmount
    public let archived: Bool
    /// The institution this account is held at, when it has one. Cash and
    /// person ledgers have none.
    public let institutionName: String?
    /// Who a gift card or a person ledger is with.
    public let contact: String?
    /// When the balance was last confirmed against an external source.
    public let balanceAsOf: Date?
    /// Gift cards only.
    public let expiresOn: Date?
    public let transactionCount: Int

    public init(
        id: String,
        name: String,
        kind: AccountKind,
        balance: MoneyAmount,
        archived: Bool,
        institutionName: String? = nil,
        contact: String? = nil,
        balanceAsOf: Date? = nil,
        expiresOn: Date? = nil,
        transactionCount: Int
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.balance = balance
        self.archived = archived
        self.institutionName = institutionName
        self.contact = contact
        self.balanceAsOf = balanceAsOf
        self.expiresOn = expiresOn
        self.transactionCount = transactionCount
    }
}
