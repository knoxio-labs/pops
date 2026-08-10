import AppCore

/// Every word this module shows, both screens, in one place.
///
/// English string literals, like `DesignSystem`'s state primitives and
/// `FeaturePairing`'s copy, and for the same reason: the app has no
/// localisation layer, and copy scattered through a view makes adding one a
/// hunt. Gathering it here makes that a change to one file.
internal enum TransactionsCopy {
    internal static let loading = "Loading transactions…"
    internal static let loadingMore = "Loading more…"
    internal static let empty = "No transactions yet."
    internal static let retry = "Retry"

    internal static let loadingDetail = "Loading transaction…"

    /// What the detail screen says about a transaction finance no longer has.
    ///
    /// Deliberately not a failure sentence and deliberately without a retry.
    /// A row deleted between a list arriving and somebody tapping it is the
    /// system working; telling them something went wrong would send them
    /// retrying a request whose answer will not change.
    internal static let detailNotFound = "This transaction no longer exists."

    /// The lead-in on the banner over content that is still readable — the row
    /// the list handed over, which is real and simply not the whole record.
    internal static let detailFailed = "Could not load the full record."

    /// The labels down the detail screen. Nested rather than prefixed so the
    /// set reads as one table: a label added here without a line on screen, or
    /// drawn without a label, is visible as a gap in this list.
    internal enum FieldLabel {
        internal static let type = "Type"
        internal static let account = "Account"
        internal static let entity = "Entity"
        internal static let tags = "Tags"
        internal static let location = "Location"
        internal static let country = "Country"
        internal static let notes = "Notes"
        internal static let lastEdited = "Last edited"
    }

    /// The lead-in on the tail of the list. Followed by ``message(for:)``, so
    /// the reader gets both what failed and why in the order they need them.
    internal static let loadMoreFailed = "Could not load more."

    /// The lead-in on the banner over rows that are still readable. Says
    /// "these are the rows you already had", which is the fact that stops
    /// someone acting on figures they think were just re-checked.
    internal static let refreshFailed = "Could not refresh."

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
            return
                "Your transactions are temporarily unreachable. "
                + "Nothing is lost — try again in a moment."
        case .unauthorized:
            return "This device is no longer signed in."
        case .contractMismatch:
            // Deliberately not "try again". The server sent something this
            // build cannot read, and no amount of retrying changes which build
            // is on the phone.
            return "This version of Pops cannot read what the server sent. Update the app."
        case .transport:
            // The payload is a diagnostic and stays out of this. Nobody holding
            // a phone can act on a URLError code.
            return "Could not reach the server. Check your connection and try again."
        case .dependencyNotBound:
            return "Pops is not set up correctly on this device."
        }
    }

    /// The failure and its reason as one sentence pair, for the tail of a list
    /// that already has rows in it.
    internal static func loadMoreFailure(_ error: RepositoryError) -> String {
        "\(loadMoreFailed) \(message(for: error))"
    }

    /// The same, for the banner over rows that survived a failed refresh.
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
        "tagged \(tags.joined(separator: ", "))"
    }
}
