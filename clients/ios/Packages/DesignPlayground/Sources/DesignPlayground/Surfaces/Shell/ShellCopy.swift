/// Copy the shell draws, mirrored by hand from `RootCopy` — which lives in
/// the app target and cannot be imported from a package. Kept word-for-word:
/// this surface reviews today's wording, not a rewrite of it, and a
/// divergence here would be silent since nothing checks the two against each
/// other.
internal enum ShellCopy {
    static let retry = "Try again"

    static let degraded =
        "Some of Pops could not be reached, so this may be out of date."

    static let nothingOffered =
        "Your Pops server is not offering anything this app can show yet."

    /// What `RootCopy.nothingAvailable(_:)` renders for a BFM answer where
    /// Transactions failed a contract check and purchases is simply down —
    /// one sentence per withheld feature, in the BFM's order.
    static let nothingUsable =
        "Transactions needs a newer version of this app. purchases is not available right now."
}
