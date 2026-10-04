import AppCore

/// Every word this module shows, across the list, the picker and the
/// dashboard, in one place — the same reason `TransactionsCopy` gathers
/// `FeatureTransactions`'s.
internal enum AccountsCopy {
    internal static let title = "Accounts"
    internal static let loading = "Loading accounts…"
    internal static let empty =
        "No accounts yet. Accounts are created on the desktop; this is where they are read."
    internal static let noActiveAccounts = "No active accounts. Try showing archived accounts."
    internal static let noMatches = "No accounts match this search."
    internal static let retry = "Retry"
    internal static let searchPlaceholder = "Search accounts"
    internal static let refreshing = "Refreshing accounts"
    internal static let loadingMore = "Loading more accounts…"
    internal static let loadMoreFailed = "Could not load more accounts."

    internal static let sectionHeld = "Held"
    internal static let sectionOwed = "Owed"
    internal static let sectionArchived = "Archived"

    internal static let archivedTag = "Archived"

    /// The subtitle under the screen title: how many accounts, and how many of
    /// those are archived.
    internal static func countLine(active: Int, archived: Int) -> String {
        let noun = active == 1 ? "account" : "accounts"
        guard archived > 0 else { return "\(active) \(noun)" }
        return "\(active) \(noun) · \(archived) archived"
    }

    internal static func refreshFailure(_ error: RepositoryError) -> String {
        "Accounts could not be refreshed. \(message(for: error))"
    }

    internal static func loadMoreFailure(_ error: RepositoryError) -> String {
        "\(loadMoreFailed) \(message(for: error))"
    }

    internal static let pickerTitle = "Account"

    internal static let loadingDetail = "Loading account…"
    internal static let detailNotFound = "This account no longer exists."
    internal static let detailFailed = "Could not load the full picture."
    internal static let recentTransactionsTitle = "Recent transactions"
    internal static let noRecentTransactions = "No recent transactions."

    internal static func message(for error: RepositoryError) -> String {
        switch error {
        case .unavailable:
            return
                "Your accounts are temporarily unreachable. "
                + "Nothing is lost — try again in a moment."
        case .unauthorized:
            return "This device is no longer signed in."
        case .rateLimited:
            return "Too many requests. Wait before trying again."
        case .contractMismatch:
            return "This version of Pops cannot read what the server sent. Update the app."
        case .requestRejected:
            return "This version of Pops sent a request the server cannot accept. Update the app."
        case .conflict:
            return "That change conflicts with something already saved."
        case .transport:
            return "Could not reach the server. Check your connection and try again."
        case .dependencyNotBound:
            return "Pops is not set up correctly on this device."
        }
    }

    internal static func detailFailure(_ error: RepositoryError) -> String {
        "\(detailFailed) \(message(for: error))"
    }
}
