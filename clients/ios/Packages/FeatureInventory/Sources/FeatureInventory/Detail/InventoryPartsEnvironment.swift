import AppCore
import SwiftUI

extension EnvironmentValues {
    /// The online assemblies seam the item page's Parts section reads. Absent
    /// in previews and tests that do not bind one, and the page then shows no
    /// Parts section at all.
    @Entry internal var inventoryParts: (any InventoryPartsService)?
}

extension View {
    /// Lets every item page below this view read and edit parts through
    /// `service`. The Inventory tab and a scanned label's page bind it
    /// themselves; an embedder that pushes item pages onto its own stack, as
    /// Search does, binds it here.
    public func inventoryParts(_ service: any InventoryPartsService) -> some View {
        environment(\.inventoryParts, service)
    }
}
