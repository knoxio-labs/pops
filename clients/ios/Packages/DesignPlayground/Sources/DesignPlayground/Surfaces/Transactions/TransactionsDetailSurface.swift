import AppCore
import FeatureTransactions

extension TransactionsSurfaces {
    /// One transaction, in every condition ``TransactionDetailState`` can put
    /// it in — plus the one screen that is not a state of its own: a fetch
    /// that fails over a seed the list already handed over, where the row on
    /// screen has to survive the failure rather than be replaced by it. See
    /// `FeatureTransactions/TransactionDetailViewModel/failure` for why that
    /// is a property beside the state rather than folded into
    /// ``TransactionDetailState/failed(_:)``.
    @MainActor internal static var detailSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "transactions", slug: "transaction"),
            title: "Transaction",
            synopsis: "One record, open on what the list already had while the rest of it arrives.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    TransactionDetailView(
                        model: detailModel(seed: seedRow, detail: .detail(Fixtures.transactionDetail))
                    )
                },
                DesignState("loading", "Loading") {
                    TransactionDetailView(model: detailModel(seed: nil, detail: .stalls))
                },
                DesignState("seeded", "Seeded, still fetching") {
                    TransactionDetailView(model: detailModel(seed: seedRow, detail: .stalls))
                },
                DesignState("not-found", "No longer exists") {
                    TransactionDetailView(model: detailModel(seed: nil, detail: .detail(nil)))
                },
                DesignState("failed", "Failed, nothing to show") {
                    TransactionDetailView(model: detailModel(seed: nil, detail: .failure(.unauthorized)))
                },
                DesignState("failed-over-seed", "Failed, seeded row kept") {
                    TransactionDetailView(
                        model: detailModel(
                            seed: seedRow,
                            detail: .failure(.transport("host unreachable"))
                        )
                    )
                },
            ]
        )
    }

    private static var seedRow: Transaction { Fixtures.transactionRows[0] }

    @MainActor
    private static func detailModel(
        seed: Transaction?,
        detail: TransactionDetailOutcome
    ) -> TransactionDetailViewModel {
        TransactionDetailViewModel(
            id: Fixtures.transactionDetail.id,
            seed: seed,
            dependencies: AppDependencies(
                transactions: PlaygroundTransactionsRepository(detail: detail),
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            )
        )
    }
}
