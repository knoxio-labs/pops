import AppCore

/// The dashboard's words: the balance headline, the kind of account, and the
/// card each kind draws under it.
///
/// Amounts, dates and months arrive already formatted for the reader's
/// locale; a count arrives as a number, so each language applies its own
/// plural rule and grouping to it.
extension AccountsCopy {
    internal static var noteYouOwe: String { localized("you owe") }
    internal static var noteOwedToYou: String { localized("owed to you") }

    internal static func owesYou(_ who: String) -> String { localized("\(who) owes you") }
    internal static func youOwe(_ who: String) -> String { localized("You owe \(who)") }
    internal static var remainingStoredValue: String { localized("Remaining stored value") }
    internal static var owedOnAccount: String { localized("Owed on this account") }
    internal static var inCreditOnAccount: String { localized("In credit on this account") }
    internal static var balanceHeld: String { localized("Balance held") }

    internal static var checkedAgainstStatement: String {
        localized("Checked against a statement")
    }
    internal static func asOf(_ day: String) -> String { localized("As of \(day)") }
    internal static var derived: String { localized("Derived from transactions") }
    internal static var derivedNeverChecked: String {
        localized("Derived from transactions, never checked")
    }
    internal static func transactionCount(_ count: Int) -> String {
        localized("\(count) transactions")
    }

    internal static var trendTitle: String { localized("Twelve months") }
    internal static func trend(rose: Bool, by amount: String) -> String {
        rose ? localized("Up \(amount) over 12 months") : localized("Down \(amount) over 12 months")
    }

    internal static var storedValueTitle: String { localized("Stored value") }
    internal static func storedValue(left remaining: String, of original: String) -> String {
        localized("\(remaining) left of \(original)")
    }
    internal static func expires(_ day: String) -> String { localized("Expires \(day)") }

    internal static var monthOnMonthTitle: String { localized("Month on month") }
    internal static func netIn(_ month: String) -> String { localized("Net in \(month)") }
    internal static var averageMonth: String { localized("Average month") }
    internal static func lowestItWent(_ month: String) -> String {
        localized("Lowest it went (\(month))")
    }
    internal static var closingBalancesNote: String {
        localized(
            "From closing balances, not transactions: money in and out are not counted apart.")
    }

    internal static var ledgerTitle: String { localized("Ledger") }
    internal static func settledUp(with who: String) -> String {
        localized("Settled up with \(who)")
    }
    internal static func open(with who: String) -> String { localized("Open with \(who)") }
    internal static func entries(_ count: Int, with who: String) -> String {
        localized("\(count) entries with \(who)")
    }
    internal static func biggestMove(_ move: String) -> String {
        localized("Biggest single move: \(move)")
    }
    internal static func move(_ signedAmount: String, in month: String) -> String {
        localized("\(signedAmount) in \(month)")
    }

    internal static var cycleTitle: String { localized("This cycle") }
    internal static func due(_ day: String) -> String { localized("Due \(day)") }
    internal static var spentThisCycle: String { localized("Spent this cycle") }
    internal static func cycleChange(rose: Bool, by amount: String) -> String {
        rose ? localized("Up \(amount) on last cycle") : localized("Down \(amount) on last cycle")
    }
    internal static func limitUse(percent: Int, limit: String, available: String) -> String {
        localized("\(percent)% of \(limit) used · \(available) available")
    }

    internal static var pointsTitle: String { localized("Points") }
    internal static var pointsExpiring: String { localized("Expiring") }
    internal static var pointsEarned: String { localized("Earned in 90 days") }
    internal static func points(_ count: Int) -> String { localized("\(count) pts") }
    internal static func pointsPerYear(_ count: Int) -> String {
        localized("\(count)/yr at this rate")
    }
    internal static func pointsWorth(_ amount: String) -> String {
        localized("Worth about \(amount) · Indicative only")
    }

    /// The label for a kind this build knows, or `nil` for one it does not.
    internal static func kindLabel(_ kind: AccountKind) -> String? {
        switch kind {
        case .checking: localized("Checking")
        case .savings: localized("Savings")
        case .creditCard: localized("Credit card")
        case .cash: localized("Cash")
        case .giftCard: localized("Gift card")
        case .person: localized("Person")
        case .shared: localized("Shared")
        case .loan: localized("Loan")
        case .novatedLease: localized("Novated lease")
        case .crypto: localized("Crypto")
        case .other: localized("Other")
        default: nil
        }
    }
}
