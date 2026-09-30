import DesignSystem
import SwiftUI

/// Inventory record and place results rendered with Inventory's selection behavior.
public struct InventorySearchRows: View {
    private let results: [InventorySearchResult]
    private let query: String
    private let onReachEnd: (() -> Void)?
    @Bindable private var session: InventorySearchSession

    /// Creates lazy rows for ranked Inventory results and an optional loaded-page boundary callback.
    public init(
        _ results: [InventorySearchResult],
        query: String,
        session: InventorySearchSession,
        onReachEnd: (() -> Void)? = nil
    ) {
        self.results = results
        self.query = query
        self.session = session
        self.onReachEnd = onReachEnd
    }

    public var body: some View {
        InventoryGroundedListPanel {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                    InventorySearchHitRow(
                        hit: result.hit,
                        query: query,
                        loadPhoto: { await session.thumbnail($0) }
                    )
                    .inventorySelectable(result.recordID, in: $session.selection)
                    .onAppear {
                        if index == results.count - 1 { onReachEnd?() }
                    }
                    if index < results.count - 1 {
                        PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }
}
