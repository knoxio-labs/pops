import AppCore

/// The label and SF Symbol a kind draws, mirroring
/// `pillars/design/src/fixtures/account-kinds.ts`'s `ACCOUNT_KINDS.label` and
/// `.icon`. Presentation, not domain — `AppCore.AccountKind` carries only the
/// ledger behaviour (`side`, `isCheckpointable`, `isStoredValue`) a screen
/// cannot get away with reinventing; a display label is exactly the kind of
/// thing that is safe to keep local to whoever draws it.
///
/// A kind this build has never heard of still gets a label: its own raw value,
/// title-cased word by word, rather than a blank subtitle nobody can explain.
internal enum AccountKindLabel {
    private static let known: [AccountKind: String] = [
        .checking: "Checking",
        .savings: "Savings",
        .creditCard: "Credit card",
        .cash: "Cash",
        .giftCard: "Gift card",
        .person: "Person",
        .shared: "Shared",
        .loan: "Loan",
        .novatedLease: "Novated lease",
        .crypto: "Crypto",
        .other: "Other",
    ]

    internal static func label(for kind: AccountKind) -> String {
        if let label = known[kind] { return label }
        return kind.rawValue
            .split(separator: "-")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    /// The SF Symbol a kind's mark falls back to when it has neither an
    /// institution logo nor an institution name to show initials for.
    internal static func symbolName(for kind: AccountKind) -> String {
        switch kind {
        case .checking: "building.columns"
        case .savings: "banknote"
        case .creditCard: "creditcard"
        case .cash: "banknote"
        case .giftCard: "gift"
        case .person: "person"
        case .shared: "person.2"
        case .loan: "hand.raised"
        case .novatedLease: "car"
        case .crypto: "bitcoinsign.circle"
        default: "circle.grid.2x2"
        }
    }
}
