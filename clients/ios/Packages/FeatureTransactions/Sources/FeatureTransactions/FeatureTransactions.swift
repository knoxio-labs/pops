import AppCore

/// The transactions list and detail screens. Placeholder — neither is written.
///
/// `AppCore` is the seams and routes a feature is allowed to reach for.
/// `DesignSystem`'s tokens and `BFMClient` are deliberately absent from this
/// file — nothing here renders yet, and this feature reads a
/// `TransactionsRepository` rather than a concrete client, which only the
/// composition root knows what implements.
public enum FeatureTransactions {
    public static let moduleName = "FeatureTransactions"

    /// Where this feature hangs off the app's route table.
    public static let entryRoute: Route = .transactionList
}
