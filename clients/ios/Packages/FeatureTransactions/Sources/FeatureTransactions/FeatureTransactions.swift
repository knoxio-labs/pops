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
}
