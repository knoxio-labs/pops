import AppCore
import SwiftUI

/// One referenced record on its own navigation stack, for the composition
/// root to present when a label or a `pops://inventory/...` link names it,
/// whichever tab is showing.
///
/// Its own stack for the reason `InventoryFlowView` has one: it is presented
/// over the app rather than pushed inside a feature, and everything the record
/// links to opens inside it.
public struct InventoryEntityView: View {
    @State private var path: [InventoryRoute] = []
    private let entity: InventoryEntity
    private let store: any InventoryStore
    private let entityRouter: any EntityRouter

    /// Reads and writes through `dependencies.inventory`, and nothing else.
    /// `entityRouter` is the same instance `InventoryFlowView` carries, for
    /// the same reason: nothing this stack can reach routes a `pops://`
    /// reference itself today, but `InventoryDestinationView` takes one
    /// router regardless of which stack presents it.
    public init(
        entity: InventoryEntity, dependencies: AppDependencies, entityRouter: any EntityRouter
    ) {
        self.entity = entity
        store = dependencies.inventory
        self.entityRouter = entityRouter
    }

    public var body: some View {
        NavigationStack(path: $path) {
            InventoryEntityRoot(entity: entity, store: store, entityRouter: entityRouter)
                .navigationDestination(for: InventoryRoute.self) { route in
                    InventoryDestinationView(route: route, store: store, entityRouter: entityRouter)
                }
        }
        .inventoryItemFormPresentation(store: store)
        .inventorySyncInterruptions(store: store)
    }
}

/// Waits for the one read that decides whether an item opens as a container
/// or as item detail, then draws that screen. A place needs no read.
private struct InventoryEntityRoot: View {
    let entity: InventoryEntity
    let store: any InventoryStore
    let entityRouter: any EntityRouter
    @State private var resolved: InventoryRoute?

    var body: some View {
        Group {
            if let resolved {
                InventoryDestinationView(route: resolved, store: store, entityRouter: entityRouter)
            } else {
                InventoryItemDetailSkeleton()
            }
        }
        .task(id: entity) { await resolve() }
    }

    private func resolve() async {
        guard case .item(let id) = entity else {
            resolved = entity.route(resolving: nil)
            return
        }
        var item: InventoryItem?
        for await answer in store.observe(.item(id: id)) {
            item = answer
            break
        }
        guard !Task.isCancelled else { return }
        resolved = entity.route(resolving: item)
    }
}
