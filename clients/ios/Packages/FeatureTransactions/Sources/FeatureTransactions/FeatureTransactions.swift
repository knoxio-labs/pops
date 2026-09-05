import AppCore

/// The transactions list, and the paging, refresh and failure handling behind
/// it.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens and primitives in `DesignSystem`.
/// `Auth` and `BFMClient` are deliberately absent — this reads a
/// ``TransactionsRepository``, and only the composition root knows that the
/// thing behind it attaches a device token and speaks HTTP to a BFM.
public enum FeatureTransactions {
    public static let moduleName = "FeatureTransactions"

    /// Where this feature hangs off the app's route table.
    public static let entryRoute: Route = .transactionList

    /// Which of the BFM's features this module draws.
    ///
    /// Declared here rather than in the composition root so the claim lives
    /// with the code that makes it good — the root then holds a list of modules
    /// rather than a list of strings it has to keep in step with them.
    public static let feature: MobileFeature = .transactions

    /// The tab bar's label for this feature.
    public static let displayName = "Transactions"

    /// The tab bar's icon for this feature.
    public static let symbolName = "list.bullet.rectangle"
}
