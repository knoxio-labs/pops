import AppCore

/// Every word this module shows, both screens, in one place.
///
/// Each sentence is written here in English and resolved through this
/// package's String Catalog, where the English is the key and `pt-BR` is the
/// translation.
internal enum TransactionsCopy {
    private static let localized = LocalizedCopy(bundle: .module)

    internal static var title: String { localized("Transactions") }
    internal static var done: String { localized("Done") }

    internal static var loading: String { localized("Loading transactions…") }
    internal static var refreshing: String { localized("Refreshing transactions") }
    internal static var loadingMore: String { localized("Loading more…") }
    internal static var empty: String { localized("No transactions yet.") }
    internal static var retry: String { localized("Retry") }

    internal static func retryTitle(for error: RepositoryError) -> String {
        guard case .rateLimited(let retryAfterSeconds) = error else { return retry }
        return localized("Wait \(waitDuration(retryAfterSeconds)), then retry")
    }

    internal static func offersRetry(for error: RepositoryError) -> Bool {
        switch error {
        case .contractMismatch, .requestRejected, .featureUnavailable, .dependencyNotBound:
            false
        case .unavailable, .unauthorized, .rateLimited, .conflict, .transport:
            true
        }
    }

    internal static var loadingDetail: String { localized("Loading transaction…") }

    /// What the detail screen says about a transaction finance no longer has.
    ///
    /// Deliberately not a failure sentence and deliberately without a retry.
    /// A row deleted between a list arriving and somebody tapping it is the
    /// system working; telling them something went wrong would send them
    /// retrying a request whose answer will not change.
    internal static var detailNotFound: String { localized("This transaction no longer exists.") }

    /// The lead-in on the banner over content that is still readable — the row
    /// the list handed over, which is real and simply not the whole record.
    internal static var detailFailed: String { localized("Could not load the full record.") }

    /// The labels down the detail screen. Nested rather than prefixed so the
    /// set reads as one table: a label added here without a line on screen, or
    /// drawn without a label, is visible as a gap in this list.
    internal enum FieldLabel {
        internal static var type: String { TransactionsCopy.localized("Type") }
        internal static var account: String { TransactionsCopy.localized("Account") }
        internal static var entity: String { TransactionsCopy.localized("Entity") }
        internal static var tags: String { TransactionsCopy.localized("Tags") }
        internal static var location: String { TransactionsCopy.localized("Location") }
        internal static var country: String { TransactionsCopy.localized("Country") }
        internal static var notes: String { TransactionsCopy.localized("Notes") }
        internal static var lastEdited: String { TransactionsCopy.localized("Last edited") }
    }

    /// The lead-in on the tail of the list. Followed by ``message(for:)``, so
    /// the reader gets both what failed and why in the order they need them.
    internal static var loadMoreFailed: String { localized("Could not load more.") }

    /// The lead-in on the banner over rows that are still readable. Says
    /// "these are the rows you already had", which is the fact that stops
    /// someone acting on figures they think were just re-checked.
    internal static var refreshFailed: String { localized("Could not refresh.") }

    /// One sentence per failure, because each one has a different next move.
    ///
    /// ``RepositoryError/unavailable`` is the sentence this screen exists to be
    /// able to say. It is the difference between "finance is down" and the
    /// empty state's "you have no transactions", and the BFM goes to the
    /// trouble of returning a typed unavailable response so that the app never
    /// has to guess which one is true.
    internal static func message(for error: RepositoryError) -> String {
        switch error {
        case .unavailable:
            return localized(
                """
                Your transactions are temporarily unreachable. \
                Nothing is lost — try again in a moment.
                """)
        case .unauthorized:
            return localized("This device is no longer signed in.")
        case .featureUnavailable:
            return localized("This feature isn't available with this device's permissions.")
        case .rateLimited(let retryAfterSeconds):
            let wait = waitDuration(retryAfterSeconds)
            return localized("Too many requests. Wait \(wait) before trying again.")
        case .contractMismatch:
            // Deliberately not "try again". The server sent something this
            // build cannot read, and no amount of retrying changes which build
            // is on the phone.
            return localized(
                "This version of Pops cannot read what the server sent. Update the app.")
        case .requestRejected:
            return localized(
                "This version of Pops sent a request the server cannot accept. Update the app.")
        case .conflict:
            return localized("That change conflicts with something already saved.")
        case .transport(let failure)
        where failure.popsError?.code == "gateway.upstream_unavailable":
            return message(for: .unavailable)
        case .transport:
            // The payload is a diagnostic and stays out of this. Nobody holding
            // a phone can act on a URLError code.
            return localized("Could not reach the server. Check your connection and try again.")
        case .dependencyNotBound:
            return localized("Pops is not set up correctly on this device.")
        }
    }

    private static func waitDuration(_ retryAfterSeconds: Int?) -> String {
        guard let retryAfterSeconds else { return localized("a minute") }
        return localized("\(max(1, retryAfterSeconds)) seconds")
    }

    /// The failure and its reason as one sentence pair, for the tail of a list
    /// that already has rows in it.
    internal static func loadMoreFailure(_ error: RepositoryError) -> String {
        "\(loadMoreFailed) \(message(for: error))"
    }

    /// The same, for the root banner shown after a failed refresh.
    internal static func refreshFailure(_ error: RepositoryError) -> String {
        "\(refreshFailed) \(message(for: error))"
    }

    /// The same again, for the detail screen sitting on the row the list handed
    /// it. What is on screen is true; there is just more of it that did not
    /// arrive, and saying which is the difference between a stale screen and a
    /// screen somebody thinks is complete.
    internal static func detailFailure(_ error: RepositoryError) -> String {
        "\(detailFailed) \(message(for: error))"
    }

    /// How a row's tags read to VoiceOver. Bare tags after the amount and the
    /// date sound like more transactions; the word is what makes the sentence
    /// parse.
    internal static func tagList(_ tags: [String]) -> String {
        localized("tagged \(tags.joined(separator: ", "))")
    }

    /// A transaction type as a word. The wire sends the type as an English
    /// identifier; one this build has never heard of is shown as it arrived
    /// rather than dropped.
    internal static func typeName(_ type: TransactionType) -> String {
        switch type {
        case .purchase: localized("purchase")
        case .transfer: localized("transfer")
        case .income: localized("income")
        case .refund: localized("refund")
        case .reversal: localized("reversal")
        case .loan: localized("loan")
        case .rebate: localized("rebate")
        case .tax: localized("tax")
        default: type.rawValue
        }
    }
}
