import DesignSystem
import SwiftUI

/// The complete Locations browser: every place in the home, a room's own
/// shelves and drawers under it. Two levels, because that is as deep as the
/// fixtures go; a real hierarchy would recurse the same grouping rather than
/// add a second shape.
internal struct InventoryLocationsBrowseView: View {
    internal var syncState: InventorySyncState = .current
    internal var isIndexing = false

    internal var body: some View {
        content
            .navigationDestination(for: InventoryRoute.self) { InventoryDestinationView(route: $0) }
    }

    @ViewBuilder private var content: some View {
        if isIndexing {
            InventoryStateNotice(kind: .loading)
        } else if roots.isEmpty {
            InventoryStateNotice(kind: .empty)
        } else {
            list
        }
    }

    private var roots: [InventoryLocationRecord] {
        InventorySearchFixtures.locations.filter { $0.parentID == nil }
    }

    private func children(of location: InventoryLocationRecord) -> [InventoryLocationRecord] {
        InventorySearchFixtures.locations.filter { $0.parentID == location.id }
    }

    private var list: some View {
        List {
            InventorySearchSyncBanner(syncState: syncState)
            ForEach(roots) { root in
                Section {
                    InventorySearchLocationRow(location: root)
                    ForEach(children(of: root)) { child in
                        InventorySearchLocationRow(location: child)
                            .padding(.leading, PopsSpacing.lg)
                    }
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}
