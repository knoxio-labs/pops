import DesignSystem
import SwiftUI

/// Inventory record and place results rendered with Inventory's selection behavior.
public struct InventorySearchRows: View {
    private let results: [InventorySearchResult]
    private let query: String
    @Bindable private var session: InventorySearchSession

    /// Creates rows for the supplied ranked Inventory results.
    public init(
        _ results: [InventorySearchResult],
        query: String,
        session: InventorySearchSession
    ) {
        self.results = results
        self.query = query
        self.session = session
    }

    public var body: some View {
        InventorySelectionPanel(rows: results) { result in
            InventorySearchHitRow(
                hit: result.hit,
                query: query,
                loadPhoto: { await session.thumbnail($0) }
            )
            .inventorySelectable(result.recordID, in: $session.selection)
        }
    }
}
