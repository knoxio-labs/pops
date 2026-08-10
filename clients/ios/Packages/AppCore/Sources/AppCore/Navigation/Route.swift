/// Every destination the app can reach.
///
/// A feature names the case it wants to go to and never the view that answers
/// to it. That indirection is what stops one feature from having to construct
/// another feature's screens in order to link to them — and, within a feature,
/// what stops one of its screens from naming another.
///
/// Where a case becomes a view is deliberately not fixed here. A feature owns
/// the map for its own routes (`FeatureTransactions.TransactionsFlowView`), so
/// that a screen linking to a sibling still names only a case; the composition
/// root owns the map across features, which is the only place that may know
/// more than one exists.
public enum Route: Hashable, Sendable {
    case transactionList
    case transactionDetail(id: Transaction.ID)
}
