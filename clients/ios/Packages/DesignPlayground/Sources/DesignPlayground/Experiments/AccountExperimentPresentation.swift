import AppCore
import SwiftUI

/// Presentation for the two accounts experiments below, trimmed to what a
/// hand-rolled comparison view needs.
///
/// Not `FeatureAccounts`'s own `AccountPresentation` — that type is internal
/// to the feature, so a prototype outside it cannot call it — and these views
/// are not staging what ships, they are staging the roads not (yet) taken.
/// `AccountsSurfaces` stages the shipped screens against the shipped views
/// instead; see its doc comment.
internal enum AccountExperimentPresentation {
    internal enum Tone {
        case positive
        case negative
        case neutral

        internal var color: Color {
            switch self {
            case .positive: .popsSuccess
            case .negative: .popsDestructive
            case .neutral: .popsForeground
            }
        }
    }

    internal struct Reading {
        internal let amount: String
        /// The counterparty word a bare sign cannot supply: who owes whom.
        internal let note: String?
        internal let tone: Tone
    }

    internal static func tone(for minorUnits: Int) -> Tone {
        if minorUnits > 0 { return .positive }
        if minorUnits < 0 { return .negative }
        return .neutral
    }

    internal static func read(_ account: Account) -> Reading {
        let amount = account.balance.formatted()
        let balanceTone = tone(for: account.balance.minorUnits)
        guard account.kind.side == .either, account.balance.minorUnits != 0 else {
            return Reading(amount: amount, note: nil, tone: balanceTone)
        }
        return Reading(
            amount: amount,
            note: account.balance.minorUnits < 0 ? "you owe" : "owed to you",
            tone: balanceTone
        )
    }

    /// The institution, the contact, or failing both the kind: who this
    /// account is with.
    internal static func subtitle(_ account: Account) -> String {
        account.institutionName ?? account.contact ?? label(for: account.kind)
    }

    /// The kind's own name — not on `AccountKind` itself because a display
    /// string is a design decision and `AppCore` holds none.
    internal static func label(for kind: AccountKind) -> String {
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

    internal static func symbol(for kind: AccountKind) -> String {
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
    internal static func markColor(for kind: AccountKind) -> Color {
        switch kind.side {
        case .asset: .popsAccent
        case .liability: .popsDestructive
        case .either: .popsWarning
        }
    }
}
