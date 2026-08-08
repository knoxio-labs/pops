import AppCore
import DesignSystem

/// The transactions list and detail screens. Placeholder — neither is written.
///
/// The imports above are the whole of what a feature is allowed to reach for:
/// the seams and routes in `AppCore`, the tokens in `DesignSystem`. `BFMClient`
/// is deliberately absent — this feature reads a `TransactionsRepository`, and
/// only the composition root knows what implements it.
public enum FeatureTransactions {
    public static let moduleName = "FeatureTransactions"

    /// Where this feature hangs off the app's route table.
    public static let entryRoute: Route = .transactionList
}
