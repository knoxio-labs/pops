/// Reading accounts, as the feature that renders them sees it.
///
/// Read-only by design: creating, editing and archiving an account are
/// desktop-scale jobs and this app never offers them. A conforming
/// implementation is not asked to support anything this protocol does not
/// name.
public protocol AccountsRepository: Sendable {
    /// Every account this device can read, active and archived alike. Small
    /// enough in practice to fetch whole rather than page — unlike the
    /// transaction ledger behind it, an account list is not something a
    /// household grows into the thousands.
    func accounts() async throws -> [Account]

    /// The fuller record behind one account's dashboard.
    ///
    /// - Returns: `nil` when finance no longer has it — the same reasoning as
    ///   ``TransactionsRepository/transactionDetail(id:)``: an account archived
    ///   or removed between a list arriving and somebody opening it is an
    ///   ordinary outcome, not a failure to retry.
    func accountDetail(id: Account.ID) async throws -> AccountDetail?
}
