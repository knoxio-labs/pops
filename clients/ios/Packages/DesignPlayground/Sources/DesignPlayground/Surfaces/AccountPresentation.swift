import AppCore
import DesignSystem
import Foundation
import SwiftUI

/// How an account reads on the phone: the words over the number, the number's
/// tone, and where the number came from.
///
/// A port of the web playground's `kit/ios-account-balance.ts`, kept in step
/// with it deliberately — the two playgrounds are meant to be designing the
/// same product, and a phone that phrases a person ledger differently from the
/// desktop is two products.
///
/// Presentation only. There is no lookup, no fetch and no rule here that
/// decides anything about an account; every function below turns a value the
/// caller already has into words.
internal enum AccountPresentation {
    /// Ledger-signed, always: positive is money you can use, negative is money
    /// you owe, and the tone follows the sign directly rather than the kind.
    enum Tone {
        case positive
        case negative
        case neutral

        var color: Color {
            switch self {
            case .positive: .popsSuccess
            case .negative: .popsDestructive
            case .neutral: .popsForeground
            }
        }
    }

    struct Reading {
        let amount: String
        /// The counterparty word a bare sign cannot supply: who owes whom.
        let note: String?
        let tone: Tone
    }

    static func tone(for minorUnits: Int) -> Tone {
        if minorUnits > 0 { return .positive }
        if minorUnits < 0 { return .negative }
        return .neutral
    }

    static func read(_ account: Account) -> Reading {
        let amount = account.balance.formatted()
        let tone = tone(for: account.balance.minorUnits)
        guard account.kind.side == .either, account.balance.minorUnits != 0 else {
            return Reading(amount: amount, note: nil, tone: tone)
        }
        return Reading(
            amount: amount,
            note: account.balance.minorUnits < 0 ? "you owe" : "owed to you",
            tone: tone
        )
    }

    /// The sentence over the headline number on the account's own screen.
    static func balanceCaption(_ account: Account) -> String {
        let who = account.contact ?? account.name
        if account.kind.side == .either {
            return account.balance.minorUnits >= 0 ? "\(who) owes you" : "You owe \(who)"
        }
        if account.kind.isStoredValue { return "Remaining stored value" }
        if account.kind.side == .liability {
            return account.balance.minorUnits < 0
                ? "Owed on this account" : "In credit on this account"
        }
        return "Balance held"
    }

    /// The institution, the contact, or failing both the kind: who this
    /// account is with.
    static func subtitle(_ account: Account) -> String {
        account.institutionName ?? account.contact ?? label(for: account.kind)
    }

    /// When the number was last true, phrased so a derived balance never
    /// claims to have been checked.
    static func provenance(_ account: Account) -> String {
        if let asOf = account.balanceAsOf {
            return "As of \(day(asOf))"
        }
        return account.kind.isCheckpointable ? "Never checked against the bank" : "Never counted"
    }

    static func day(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// The kind's own name. Not on `AccountKind` itself because a display
    /// string is a design decision and `AppCore` holds none — the same reason
    /// the web playground keeps these in `fixtures/account-kinds.ts` rather
    /// than in the contract.
    static func label(for kind: AccountKind) -> String {
        switch kind {
        case .checking: "Checking"
        case .savings: "Savings"
        case .creditCard: "Credit card"
        case .cash: "Cash"
        case .giftCard: "Gift card"
        case .person: "Person"
        case .shared: "Shared"
        case .loan: "Loan"
        case .novatedLease: "Novated lease"
        case .crypto: "Crypto"
        default: "Other"
        }
    }

    static func symbol(for kind: AccountKind) -> String {
        switch kind {
        case .checking: "creditcard"
        case .savings: "banknote"
        case .creditCard: "creditcard.fill"
        case .cash: "wallet.bifold"
        case .giftCard: "giftcard"
        case .person: "person"
        case .shared: "person.2"
        case .loan: "house"
        case .novatedLease: "car"
        case .crypto: "bitcoinsign"
        default: "square.dashed"
        }
    }

    /// The mark's colour. Kinds that share a side share a hue so a list reads
    /// as two families before it reads as ten kinds.
    static func markColor(for kind: AccountKind) -> Color {
        switch kind.side {
        case .asset: .popsAccent
        case .liability: .popsDestructive
        case .either: .popsWarning
        }
    }
}
