import Foundation

/// What a balance is anchored on, mirroring finance's own `basis` (ADR-051).
///
/// The distinction is not cosmetic. ``checkpoint`` means the figure is pinned
/// to a balance somebody read off the account and adjusted by the transactions
/// since; ``transactions`` means finance found no checkpoint at all and the
/// figure is the sum of whatever happens to have been imported — net flow,
/// which can sit arbitrarily far from what the account actually holds. A
/// screen that renders the two identically is presenting a guess as a fact.
public enum BalanceBasis: Hashable, Sendable {
    case checkpoint
    case transactions
}

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
    /// The date the balance is true as of — for a ``BalanceBasis/checkpoint``
    /// figure, when it was last anchored; for a ``BalanceBasis/transactions``
    /// one, simply how far the ledger runs.
    public let balanceAsOf: Date?
    /// What the balance is anchored on, which decides how honestly it can be
    /// phrased. See ``BalanceBasis``.
    public let balanceBasis: BalanceBasis
    /// Finance's own reading that the ledger and a checkpoint disagree by more
    /// than rounding. Always `false` under ``BalanceBasis/transactions``,
    /// where there is no checkpoint to disagree with.
    ///
    /// Carried but not yet drawn: how a disagreement reads on a phone is a
    /// design question rather than a rendering one (POPS-2927).
    public let balanceInconsistent: Bool
    /// Gift cards only.
    public let expiresOn: Date?
    /// How many transactions this account holds — every row finance has for
    /// it, pending and transfer rows included (POPS-2924).
    ///
    /// Optional so a repository or fixture that has none to report can leave
    /// it out rather than inventing a number; a screen drops the clause
    /// rather than showing a zero that reads as "no transactions". The BFM
    /// wire itself always carries a real count.
    public let transactionCount: Int?

    public init(
        id: String,
        name: String,
        kind: AccountKind,
        balance: MoneyAmount,
        archived: Bool,
        institutionName: String? = nil,
        contact: String? = nil,
        balanceAsOf: Date? = nil,
        balanceBasis: BalanceBasis = .transactions,
        balanceInconsistent: Bool = false,
        expiresOn: Date? = nil,
        transactionCount: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.balance = balance
        self.archived = archived
        self.institutionName = institutionName
        self.contact = contact
        self.balanceAsOf = balanceAsOf
        self.balanceBasis = balanceBasis
        self.balanceInconsistent = balanceInconsistent
        self.expiresOn = expiresOn
        self.transactionCount = transactionCount
    }
}
