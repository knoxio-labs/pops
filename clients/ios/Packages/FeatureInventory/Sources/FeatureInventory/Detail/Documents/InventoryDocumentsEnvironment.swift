import AppCore
import SwiftUI

extension EnvironmentValues {
    /// The online documents seam the item page's Documents section reads.
    /// Absent in previews and tests that do not bind one, and the page then
    /// shows the replica's document titles alone.
    @Entry internal var inventoryDocuments: (any InventoryDocumentsService)?
}

extension View {
    /// Lets every item page below this view read, open and edit documents
    /// through `service`. The Inventory tab and a scanned label's page bind
    /// it themselves; an embedder that pushes item pages onto its own stack,
    /// as Search does, binds it here.
    public func inventoryDocuments(_ service: any InventoryDocumentsService) -> some View {
        environment(\.inventoryDocuments, service)
    }
}
