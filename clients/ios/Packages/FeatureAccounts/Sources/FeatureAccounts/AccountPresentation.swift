import AppCore
import DesignSystem
import SwiftUI

/// Ledger-signed, always: positive is money you can use, negative is money you
/// owe, and the colour follows that sign directly rather than the account's
/// kind. This mirrors `pillars/design/src/kit/ios-account-balance.ts` exactly —
/// the two must not drift, because a phone that reads a debt as a credit is
/// not a rendering bug, it is wrong about someone's money.
internal enum BalanceTone: Hashable, Sendable {
    case positive
    case negative
    case neutral
}

/// The amount as its own sign, the counterparty word a ledger needs, and the
/// tone.
internal struct BalanceReading: Hashable, Sendable {
    internal let amount: String
    /// The counterparty word a bare sign cannot supply: who owes whom.
    internal let note: String?
    internal let tone: BalanceTone
}

/// How a `Transaction`/`Account`'s fields become the strings a screen draws.
///
/// A `struct` rather than free functions, for the same reason
/// `TransactionPresentation` is one: locale is a parameter here too, even
/// though nothing in this module currently varies it, so a future date on an
/// account (a checkpoint, an expiry) formats through the same seam a test can
/// pin rather than one that reads the process's own locale.
internal struct AccountPresentation: Sendable {
    private let locale: Locale

    internal init(locale: Locale = .autoupdatingCurrent) {
        self.locale = locale
    }

    private func isPointsAccount(_ account: Account) -> Bool {
        // Mirrors the design fixture's `currenciesByCode.get(...).kind ===
        // 'points'` check. This app has no currency-kind table of its own —
        // see `AccountsRepository`'s gap note — so the one non-money currency
        // it can name today is spelled out directly.
        account.balance.currencyCode == "MR" || account.balance.currencyCode == "PTS"
    }

    internal func toneForBalance(_ minorUnits: Int) -> BalanceTone {
        if minorUnits > 0 { return .positive }
        if minorUnits < 0 { return .negative }
        return .neutral
    }

    internal func readBalance(_ account: Account) -> BalanceReading {
        let amount = account.balance.formatted(locale: locale)
        if isPointsAccount(account) {
            return BalanceReading(amount: amount, note: nil, tone: .neutral)
        }
        let tone = toneForBalance(account.balance.minorUnits)
        guard account.kind.side == .either, account.balance.minorUnits != 0 else {
            return BalanceReading(amount: amount, note: nil, tone: tone)
        }
        let note = account.balance.minorUnits < 0 ? "you owe" : "owed to you"
        return BalanceReading(amount: amount, note: note, tone: tone)
    }

    internal func color(for tone: BalanceTone) -> Color {
        switch tone {
        case .positive: .popsSuccess
        case .negative: .popsDestructive
        case .neutral: .popsForeground
        }
    }

    /// The institution, the contact, or failing both the kind label: who this
    /// account is with.
    internal func subtitle(_ account: Account, kindLabel: String) -> String {
        account.institutionName ?? account.contact ?? kindLabel
    }

    /// The sentence over the headline number on the account's own screen.
    internal func balanceCaption(_ account: Account) -> String {
        let kind = account.kind
        let who = account.contact ?? account.name
        if kind.side == .either {
            return account.balance.minorUnits >= 0 ? "\(who) owes you" : "You owe \(who)"
        }
        if kind.isStoredValue { return "Remaining stored value" }
        if kind.side == .liability {
            return account.balance.minorUnits < 0
                ? "Owed on this account" : "In credit on this account"
        }
        return "Balance held"
    }

    /// When the number was last true, phrased so a derived balance never
    /// claims to be checked.
    internal func asOfNote(_ account: Account) -> String {
        if let balanceAsOf = account.balanceAsOf { return "As of \(day(balanceAsOf))" }
        if !account.kind.isCheckpointable { return "Derived from transactions" }
        return "Never checked against a statement"
    }

    internal func day(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale)
        )
    }
}
