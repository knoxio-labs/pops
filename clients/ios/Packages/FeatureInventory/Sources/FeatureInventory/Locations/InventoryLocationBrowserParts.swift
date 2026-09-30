import DesignSystem
import SwiftUI

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
                Capsule().fill(Color.popsSurface).frame(height: fieldHeight)
                    .popsShimmer()
                InventoryRowsSkeleton(rows: 5, showsTrailingValue: false)
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
