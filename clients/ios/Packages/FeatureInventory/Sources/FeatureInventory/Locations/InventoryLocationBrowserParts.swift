import DesignSystem
import SwiftUI

extension InventoryPlaceTally {
    /// Places, containers and items, in the order the browser's strip shows
    /// them.
    internal var tiles: [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Places", count: places, symbol: InventorySymbol.location.system),
            InventoryCountTile(
                title: "Containers", count: containers,
                symbol: InventorySymbol.openContainer.system),
            InventoryCountTile(title: "Items", count: items, symbol: InventorySymbol.item.system),
        ]
    }
}

/// The empty browser's one control.
internal struct InventoryAddPlaceButton: View {
    internal let action: () -> Void

    internal var body: some View {
        PopsDashedActionButton(
            title: "Add a place", symbol: InventorySymbol.location.system,
            tint: .popsInventory, action: action)
    }
}

/// The browser before its places arrive.
internal struct InventoryLocationBrowserSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var fieldHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PopsPageTitle(title: "Locations")
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    InventoryCountTilesSkeleton(count: 3)
                    Capsule().fill(Color.popsSurface).frame(height: fieldHeight)
                }
                .popsShimmer()
                PopsListSkeleton(rows: 5)
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Locations")
        .popsTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("Locations").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}
