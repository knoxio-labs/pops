import AppCore

/// The accounts list, the account picker sheet, and the read-only account
/// dashboard.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens and primitives in `DesignSystem`.
/// `Auth` and `BFMClient` are deliberately absent — this reads an
/// ``AccountsRepository``, and only the composition root knows what is behind
/// it, if anything is bound at all.
///
public enum FeatureAccounts {
    public static let moduleName = "FeatureAccounts"

    /// Where this feature hangs off the app's route table.
    public static let entryRoute: Route = .accountsList

    /// Which of the BFM's features this module draws.
    ///
    /// Declared here rather than in the composition root, for the reason
    /// `FeatureTransactions.feature` gives.
    public static let feature: MobileFeature = .accounts
}
