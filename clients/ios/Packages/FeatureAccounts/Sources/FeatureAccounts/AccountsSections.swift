import AppCore

/// The accounts list, split into Held and Owed by the sign of the balance,
/// with Archived — shown only when asked for — beneath both.
///
/// A pure value built from ``AccountsListState/loaded(_:)`` plus whatever the
/// screen's own search text and archived-visibility toggle are, rather than a
/// view computing it inline: the filtering and the sectioning are exactly the
/// logic POPS-2811 asks to be tested, and a value built by a static function
/// is what a test can assert on without a view hierarchy.
internal struct AccountsSections: Hashable, Sendable {
    internal let held: [Account]
    internal let owed: [Account]
    internal let archived: [Account]

    internal var isEmpty: Bool { held.isEmpty && owed.isEmpty && archived.isEmpty }

    /// - Parameters:
    ///   - accounts: every account the repository answered with.
    ///   - query: search text, matched case-insensitively against the name,
    ///     the institution or contact, and the kind label — the same three
    ///     fields `account-picker.tsx`'s `matches` checks.
    ///   - showArchived: whether archived accounts appear as their own
    ///     section at all. The default list is active-only.
    internal static func build(
        from accounts: [Account],
        query: String = "",
        showArchived: Bool = false
    ) -> AccountsSections {
        let matching = accounts.filter { matches($0, query: query) }
        let active = matching.filter { !$0.archived }
        return AccountsSections(
            held: active.filter { $0.balance.minorUnits >= 0 },
            owed: active.filter { $0.balance.minorUnits < 0 },
            archived: showArchived ? matching.filter(\.archived) : []
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
