import AppCore
import SwiftUI

/// A public navigation value that opens Inventory's scanner.
public struct InventoryScanLink: Hashable, Sendable {
    /// Creates a scanner navigation value.
    public init() {}
}

extension View {
    /// Registers Inventory record, place and scanner destinations for embedded search rows.
    public func inventorySearchDestinations(
        store: any InventoryStore,
        entityRouter: any EntityRouter
    ) -> some View {
        navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route, store: store, entityRouter: entityRouter)
        }
        .navigationDestination(for: InventoryScanLink.self) { _ in
            InventoryScanScreen(store: store, entityRouter: entityRouter)
        }
    }
}
