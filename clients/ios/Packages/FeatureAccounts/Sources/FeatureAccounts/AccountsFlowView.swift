import AppCore
import SwiftUI

/// This feature's screens and the navigation between them, as one view an
/// embedder can place without knowing either screen exists — the same shape
/// `TransactionsFlowView` takes, and for the same reasons given there.
public struct AccountsFlowView: View {
    @State private var flow: AccountsFlow

    public init(dependencies: AppDependencies, router: Router) {
        _flow = State(wrappedValue: AccountsFlow(dependencies: dependencies, router: router))
    }

    public var body: some View {
        NavigationStack(path: flow.router.stackPath) {
            AccountsListView(model: flow.list)
                .navigationDestination(for: Route.self, destination: destination)
        }
    }

    @ViewBuilder private func destination(for route: Route) -> some View {
        switch route {
        case .accountsList:
            AccountsListView(model: flow.list)
        case .accountDetail(let id):
            AccountDetailView(
                model: AccountDetailViewModel(
                    id: id,
                    seed: flow.list.account(id: id),
                    dependencies: flow.dependencies
                )
            )
        case .transactionList, .transactionDetail:
            // Unreachable: this feature never pushes a transactions route, and
            // `ModuleBoundaryTests`'s "no feature imports another feature"
            // keeps it from ever being able to build one to push. Resolved to
            // an empty view anyway rather than left unhandled, for the same
            // reason `TransactionsFlowView` resolves its own unreachable case.
            EmptyView()
        }
    }
}

/// What ``AccountsFlowView`` captures once and must never hold half of — see
/// `TransactionsFlow`'s note for why this is a type rather than three
/// properties seeded separately.
@MainActor
internal struct AccountsFlow {
    internal let list: AccountsListViewModel
    internal let router: Router
    internal let dependencies: AppDependencies

    internal init(dependencies: AppDependencies, router: Router) {
        self.dependencies = dependencies
        self.router = router
        list = AccountsListViewModel(dependencies: dependencies, router: router)
    }
}
