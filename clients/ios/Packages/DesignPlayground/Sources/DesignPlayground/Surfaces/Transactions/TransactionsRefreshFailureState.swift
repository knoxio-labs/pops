import AppCore
import DesignSystem
import FeatureTransactions
import SwiftUI

/// Drives a first load and then a refresh before ``TransactionsListView`` ever
/// mounts, so the state a review sees is "rows on screen, refresh failed" and
/// not a race between this and the view's own `.task { loadFirstPage() }`.
///
/// `TransactionsListView` starts its own first-page fetch the moment it
/// appears. Nesting it under an unconditional `.task { loadFirstPage();
/// refresh() }` here would run that fetch concurrently with the view's own —
/// whichever wins the model's re-entrancy guard is scheduler-dependent, so the
/// refresh could reach the repository before the load that must precede it.
/// Gating on `isReady` keeps `TransactionsListView` off screen until both
/// calls have actually completed; once it does mount, its own `.task` finds
/// `hasLoaded` already true and returns immediately.
internal struct TransactionsRefreshFailureState: View {
    @State private var model: TransactionsListViewModel
    @State private var isReady = false

    private let repository: PlaygroundRefreshFailureTransactionsRepository

    internal init(repository: PlaygroundRefreshFailureTransactionsRepository) {
        self.repository = repository
        _model = State(
            wrappedValue: TransactionsListViewModel(
                dependencies: AppDependencies(
                    transactions: repository,
                    pairing: AppDependencies.unbound.pairing,
                    reachability: AppDependencies.unbound.reachability,
                    receiptCapture: AppDependencies.unbound.receiptCapture,
                    purchases: AppDependencies.unbound.purchases,
                    accounts: AppDependencies.unbound.accounts
                ),
                router: Router()
            ))
    }

    internal var body: some View {
        if isReady {
            TransactionsListView(model: model)
        } else {
            LoadingStateView()
                .task {
                    await model.loadFirstPage()
                    await model.refresh()
                    isReady = true
                }
        }
    }
}
