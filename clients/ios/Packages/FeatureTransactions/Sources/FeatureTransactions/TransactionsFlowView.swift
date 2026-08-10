import AppCore
import SwiftUI

/// This feature's screens and the navigation between them, as one view an
/// embedder can place without knowing either screen exists.
///
/// ## Why the mapping is here and not on the list
///
/// `Route` names a destination; something has to turn a case into a view. That
/// job is deliberately not the list's: a list that constructed the detail
/// screen would name its concrete type, and the two would then have to be
/// changed together forever. Here, the list sends
/// ``TransactionsListViewModel/select(_:)`` and never learns what answers.
///
/// ## Why it is not in the composition root either — yet
///
/// `Route.transactionList` and `Route.transactionDetail(id:)` both belong to
/// this feature, so this is a feature resolving its *own* routes rather than
/// one feature reaching into another's screens, which is the coupling the
/// indirection exists to prevent. The app-wide root (POPS-1391) may hoist the
/// map once there is more than one feature to map, and nothing here has to
/// change for it: an embedder already only names this view.
///
/// It is also what makes the detail screen open on content. This view holds the
/// list's model, so it can hand the tapped row over as a seed — which is the
/// only place in the app that has both halves without a shared cache somebody
/// would then have to invalidate.
public struct TransactionsFlowView: View {
    @State private var list: TransactionsListViewModel

    private let router: Router
    private let dependencies: AppDependencies

    public init(dependencies: AppDependencies, router: Router) {
        _list = State(
            wrappedValue: TransactionsListViewModel(dependencies: dependencies, router: router))
        self.router = router
        self.dependencies = dependencies
    }

    public var body: some View {
        NavigationStack(path: router.stackPath) {
            TransactionsListView(model: list)
                .navigationDestination(for: Route.self, destination: destination)
        }
    }

    @ViewBuilder private func destination(for route: Route) -> some View {
        switch route {
        case .transactionList:
            // Unreachable from this feature — the list is the stack's root, and
            // nothing pushes it. Resolved anyway rather than left as a blank
            // screen, because a route table that answers some of its cases with
            // nothing fails in the one place nobody is looking.
            TransactionsListView(model: list)
        case .transactionDetail(let id):
            TransactionDetailView(
                model: TransactionDetailViewModel(
                    id: id,
                    seed: list.transaction(id: id),
                    dependencies: dependencies
                )
            )
        }
    }
}
