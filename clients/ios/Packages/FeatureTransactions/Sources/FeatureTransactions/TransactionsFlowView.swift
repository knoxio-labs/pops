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
    /// The list model, the router it sends to, and the dependencies its
    /// destinations are built from — held as one value, in `@State`, and that
    /// is not tidiness.
    ///
    /// `@State` keeps whatever it was first initialised with, while a stored
    /// `let` is replaced every time the view is re-created. Split across the
    /// two, a caller writing `TransactionsFlowView(…, router: Router())` inside
    /// a parent's body — which every re-render re-evaluates — would leave the
    /// list sending taps to the router it captured while the `NavigationStack`
    /// rendered a different, newer one. Taps would land, the path would change,
    /// and the screen would not move: a failure with no error and nothing to
    /// see. Holding the three together makes that unrepresentable rather than
    /// merely unlikely.
    @State private var flow: TransactionsFlow

    public init(dependencies: AppDependencies, router: Router) {
        _flow = State(wrappedValue: TransactionsFlow(dependencies: dependencies, router: router))
    }

    public var body: some View {
        NavigationStack(path: flow.router.stackPath) {
            TransactionsListView(model: flow.list)
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
            TransactionsListView(model: flow.list)
        case .transactionDetail(let id):
            TransactionDetailView(
                model: TransactionDetailViewModel(
                    id: id,
                    seed: flow.list.transaction(id: id),
                    dependencies: flow.dependencies
                )
            )
        }
    }
}

/// What ``TransactionsFlowView`` captures once and must never hold half of.
///
/// A type rather than three `@State` properties seeded from the same `init`,
/// because three of them can be got wrong one at a time — which is exactly the
/// defect this exists to close — and one cannot.
@MainActor
internal struct TransactionsFlow {
    internal let list: TransactionsListViewModel
    internal let router: Router
    internal let dependencies: AppDependencies

    internal init(dependencies: AppDependencies, router: Router) {
        self.dependencies = dependencies
        self.router = router
        list = TransactionsListViewModel(dependencies: dependencies, router: router)
    }
}
