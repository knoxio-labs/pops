/// Every destination the app can reach.
///
/// A feature names the case it wants to go to; only the composition root maps a
/// case to a view. That indirection is what stops one feature from having to
/// construct another feature's screens in order to link to them.
public enum Route: Hashable, Sendable {
    case transactionList
    case transactionDetail(id: Transaction.ID)
}
