import AppCore

/// The account picker's own split: everything matching a search, active
/// accounts first and archived ones in their own section beneath.
///
/// Kept apart from ``AccountsSections`` because the two screens split
/// differently on purpose: the list groups by what a balance *is* (held or
/// owed), and the picker cares only about which accounts you can still pick
/// versus which are retired — the sign of the balance is beside the point when
/// what you are doing is choosing one.
internal struct AccountPickerSections: Hashable, Sendable {
    internal let active: [Account]
    internal let archived: [Account]

    /// - Parameters:
    ///   - accounts: every account offered to the picker.
    ///   - query: search text, matched case-insensitively against the name,
    ///     the institution or contact, and the kind label.
    internal static func build(from accounts: [Account], query: String = "")
        -> AccountPickerSections
    {
        let matching = accounts.filter { matches($0, query: query) }
        return AccountPickerSections(
            active: matching.filter { !$0.archived },
            archived: matching.filter(\.archived)
        )
    }

    private static func matches(_ account: Account, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        let haystack = [
            account.name, account.institutionName, account.contact,
            AccountKindLabel.label(for: account.kind),
        ]
        .compactMap { $0 }
        .joined(separator: " ")
        return haystack.localizedCaseInsensitiveContains(trimmed)
    }
}
