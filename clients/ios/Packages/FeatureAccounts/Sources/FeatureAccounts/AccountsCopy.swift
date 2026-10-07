import AppCore
import Foundation

/// Every word this module shows, across the list, the picker and the
/// dashboard, in one place — the same reason `TransactionsCopy` gathers
/// `FeatureTransactions`'s.
///
/// Each sentence is written here in English and resolved through this
/// package's String Catalog, where the English is the key and `pt-BR` is the
/// translation. The dashboard's cards are in `AccountsCopy+Facts.swift`.
internal enum AccountsCopy {
    internal static let localized = LocalizedCopy(bundle: .module)

    internal static var title: String { localized("Accounts") }
    internal static var done: String { localized("Done") }
    internal static var loading: String { localized("Loading accounts…") }
    internal static var empty: String {
        localized(
            "No accounts yet. Accounts are created on the desktop; this is where they are read.")
    }
    internal static var noActiveAccounts: String {
        localized("No active accounts. Try showing archived accounts.")
    }
    internal static var noMatches: String { localized("No accounts match this search.") }
    internal static var retry: String { localized("Retry") }
    internal static var searchPlaceholder: String { localized("Search accounts") }
    internal static var refreshing: String { localized("Refreshing accounts") }
    internal static var loadingMore: String { localized("Loading more accounts…") }
    internal static var loadMoreFailed: String { localized("Could not load more accounts.") }

    internal static var sectionHeld: String { localized("Held") }
    internal static var sectionOwed: String { localized("Owed") }
    internal static var sectionArchived: String { localized("Archived") }

    internal static var archivedTag: String { localized("Archived") }
    internal static var showArchived: String { localized("Show archived") }
    internal static var hideArchived: String { localized("Hide archived") }

    /// The subtitle under the screen title: how many accounts, and how many of
    /// those are archived.
    internal static func countLine(active: Int, archived: Int) -> String {
        let accounts = localized("\(active) accounts")
        guard archived > 0 else { return accounts }
        let archivedClause = localized("\(archived) archived")
        return "\(accounts) · \(archivedClause)"
    }

    internal static func refreshFailure(_ error: RepositoryError) -> String {
        let reason = message(for: error)
        return localized("Accounts could not be refreshed. \(reason)")
    }

    internal static func loadMoreFailure(_ error: RepositoryError) -> String {
        "\(loadMoreFailed) \(message(for: error))"
    }

    internal static var pickerTitle: String { localized("Account") }

    internal static var loadingDetail: String { localized("Loading account…") }
    internal static var detailNotFound: String { localized("This account no longer exists.") }
    internal static var detailFailed: String { localized("Could not load the full picture.") }
    internal static var recentTransactionsTitle: String { localized("Recent transactions") }
    internal static var noRecentTransactions: String { localized("No recent transactions.") }

    internal static func message(for error: RepositoryError) -> String {
        switch error {
        case .unavailable:
            return localized(
                """
                Your accounts are temporarily unreachable. \
                Nothing is lost — try again in a moment.
                """)
        case .unauthorized:
            return localized("This device is no longer signed in.")
        case .featureUnavailable:
            return localized("This phone is not allowed to use Accounts.")
        case .rateLimited:
            return localized("Too many requests. Wait before trying again.")
        case .contractMismatch:
            return localized(
                "This version of Pops cannot read what the server sent. Update the app.")
        case .requestRejected:
            return localized(
                "This version of Pops sent a request the server cannot accept. Update the app.")
        case .conflict:
            return localized("That change conflicts with something already saved.")
        case .transport:
            return localized("Could not reach the server. Check your connection and try again.")
        case .dependencyNotBound:
            return localized("Pops is not set up correctly on this device.")
        }
    }

    internal static func detailFailure(_ error: RepositoryError) -> String {
        "\(detailFailed) \(message(for: error))"
    }
}
