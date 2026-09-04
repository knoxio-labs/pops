import Foundation

/// One point in an account's balance history. Minor units, signed the same way
/// the account's own balance is — a liability's series rises as more is owed.
public struct AccountBalancePoint: Hashable, Sendable {
    /// ISO month, `YYYY-MM`.
    public let month: String
    public let balanceMinorUnits: Int

    public init(month: String, balanceMinorUnits: Int) {
        self.month = month
        self.balanceMinorUnits = balanceMinorUnits
    }
}

/// A credit card's current billing cycle.
public struct AccountCardCycle: Hashable, Sendable {
    public let creditLimitMinorUnits: Int
    public let closesOn: Date
    public let dueOn: Date
    public let cycleSpendMinorUnits: Int
    public let previousCycleSpendMinorUnits: Int

    public init(
        creditLimitMinorUnits: Int,
        closesOn: Date,
        dueOn: Date,
        cycleSpendMinorUnits: Int,
        previousCycleSpendMinorUnits: Int
    ) {
        self.creditLimitMinorUnits = creditLimitMinorUnits
        self.closesOn = closesOn
        self.dueOn = dueOn
        self.cycleSpendMinorUnits = cycleSpendMinorUnits
        self.previousCycleSpendMinorUnits = previousCycleSpendMinorUnits
    }
}

/// A points account's expiry and earning picture.
public struct AccountPointsPlan: Hashable, Sendable {
    public let expiringPoints: Int
    public let expiresOn: Date
    public let earnedLast90Days: Int
    /// Indicative worth of one point, in minor units of a reference currency.
    public let centsPerPoint: Double

    public init(
        expiringPoints: Int,
        expiresOn: Date,
        earnedLast90Days: Int,
        centsPerPoint: Double
    ) {
        self.expiringPoints = expiringPoints
        self.expiresOn = expiresOn
        self.earnedLast90Days = earnedLast90Days
        self.centsPerPoint = centsPerPoint
    }
}

/// The fuller record behind one account's dashboard.
///
/// A separate type from ``Account`` for the same reason ``TransactionDetail``
/// is separate from ``Transaction``: the list is what a screen needs for a row,
/// this is what its own screen needs to draw a trend and a kind's facts. Most
/// of the kind-specific fields are `nil` — a kind with nothing designed for it
/// carries none of them, and the screen renders no card rather than an empty
/// one.
public struct AccountDetail: Hashable, Sendable, Identifiable {
    public var id: Account.ID { account.id }

    public let account: Account
    /// Twelve months of balances, oldest first. Empty when there is not enough
    /// history to chart.
    public let history: [AccountBalancePoint]
    public let card: AccountCardCycle?
    public let points: AccountPointsPlan?
    /// A gift card's original loaded value, minor units — what "stored value"
    /// is measured against.
    public let originalValueMinorUnits: Int?
    /// The account's most recent transactions, newest first.
    public let recentTransactions: [Transaction]

    public init(
        account: Account,
        history: [AccountBalancePoint] = [],
        card: AccountCardCycle? = nil,
        points: AccountPointsPlan? = nil,
        originalValueMinorUnits: Int? = nil,
        recentTransactions: [Transaction] = []
    ) {
        self.account = account
        self.history = history
        self.card = card
        self.points = points
        self.originalValueMinorUnits = originalValueMinorUnits
        self.recentTransactions = recentTransactions
    }
}
