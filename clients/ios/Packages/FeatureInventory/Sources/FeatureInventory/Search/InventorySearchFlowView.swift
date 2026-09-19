import AppCore
import SwiftUI

/// Search across Inventory as its own tab: the search screen at the root of
/// its own navigation stack, and every page a result opens.
///
/// It is a separate view from `InventoryFlowView` because the approved shell
/// places search in the tab bar's search slot rather than inside the
/// Inventory tab; the embedder gives it that slot. It owns its stack for the
/// same reason the Inventory tab does: a stack inside a stack is broken.
public struct InventorySearchFlowView: View {
    @State private var model: InventorySearchViewModel
    @State private var path: [InventoryRoute] = []
    private let store: any InventoryStore
    private let entityRouter: any EntityRouter

    /// Reads and writes through `dependencies.inventory`, and nothing else.
    /// `entityRouter` is the composition root's one instance, the same
    /// `InventoryFlowView` carries.
    public init(dependencies: AppDependencies, entityRouter: any EntityRouter) {
        store = dependencies.inventory
        self.entityRouter = entityRouter
        _model = State(wrappedValue: InventorySearchViewModel(store: dependencies.inventory))
    }

    public var body: some View {
        NavigationStack(path: $path) {
            InventorySearchView(model: model, scan: { path.append(.scan) })
                .navigationDestination(for: InventoryRoute.self) { route in
                    InventoryDestinationView(route: route, store: store, entityRouter: entityRouter)
                }
        }
    }
}
