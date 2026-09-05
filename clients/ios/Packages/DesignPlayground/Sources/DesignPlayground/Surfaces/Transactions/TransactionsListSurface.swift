import AppCore
import FeatureTransactions

extension TransactionsSurfaces {
    /// The transactions list, in every condition ``TransactionsListState`` and
    /// ``PagingState`` can put it in.
    ///
    /// ``PagingState/idle`` has no state of its own here. The list's own
    /// footer fires its next-page fetch the moment it appears, so idle is true
    /// for less than a frame before becoming ``PagingState/loading`` — the
    /// footer draws the same words either way, and there is nothing to hold
    /// still long enough to review.
    @MainActor internal static var listSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "transactions", slug: "list"),
            title: "Transactions",
            synopsis: "The ledger the app renders — loading, empty, failing, and paging that keeps its rows.",
            chrome: .navigationAndTabs,
            states: [
                DesignState.standard {
                    TransactionsListView(model: listModel(pages: [.page(loadedPage)]))
                },
                DesignState("loading", "Loading") {
                    TransactionsListView(model: listModel(pages: [.stalls]))
                },
                DesignState("empty", "Empty") {
                    TransactionsListView(model: listModel(pages: [.page(emptyPage)]))
                },
                DesignState("failed", "Finance unavailable") {
                    TransactionsListView(model: listModel(pages: [.failure(.unavailable)]))
                },
                DesignState("loading-more", "Loading more") {
                    TransactionsListView(model: listModel(pages: [.page(pagedFirstPage), .stalls]))
                },
                DesignState("paging-failed", "Paging failed, rows kept") {
                    TransactionsListView(
                        model: listModel(
                            pages: [
                                .page(pagedFirstPage),
                                .failure(.transport("host unreachable")),
                            ]
                        )
                    )
                },
            ]
        )
    }

    private static var loadedPage: TransactionPage {
        TransactionPage(transactions: Fixtures.transactionRows, nextCursor: nil)
    }

    private static var emptyPage: TransactionPage {
        TransactionPage(transactions: [], nextCursor: nil)
    }

    /// A first page with more behind it, for the two states that need a
    /// second fetch to observe: one where it never answers and one where it
    /// throws over the rows the first page already delivered.
    private static var pagedFirstPage: TransactionPage {
        TransactionPage(transactions: Fixtures.transactionRows, nextCursor: "next")
    }

    @MainActor
    private static func listModel(pages: [TransactionPageOutcome]) -> TransactionsListViewModel {
        TransactionsListViewModel(
            dependencies: AppDependencies(
                transactions: PlaygroundTransactionsRepository(pages: pages),
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ),
            router: Router()
        )
    }
}
