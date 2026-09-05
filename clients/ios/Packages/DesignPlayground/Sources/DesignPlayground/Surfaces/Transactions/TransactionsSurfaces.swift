/// Every playground surface `FeatureTransactions` contributes: the ledger and
/// the record behind one of its rows.
///
/// Split across two sibling files — `TransactionsListSurface.swift` and
/// `TransactionsDetailSurface.swift` — because a `DesignSurface` with every
/// state it needs inline already fills a file on its own. Both stage the
/// actual `TransactionsListView`/`TransactionDetailView` the app ships,
/// against a ``PlaygroundTransactionsRepository`` rather than a look-alike —
/// see `Catalog.swift` for why every surface here can afford to depend on a
/// real feature's views and still never touch a network.
internal enum TransactionsSurfaces {
    @MainActor internal static let surfaces: [DesignSurface] = [listSurface, detailSurface]
}
