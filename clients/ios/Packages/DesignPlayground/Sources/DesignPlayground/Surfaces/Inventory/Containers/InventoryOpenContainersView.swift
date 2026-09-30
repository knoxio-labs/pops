import DesignSystem
import SwiftUI

/// Every open container, full screen, in the dashboard's panel.
internal struct InventoryOpenContainersView: View {
    @State private var containers: [InventoryContainerProfile]

    internal init(containers: [InventoryContainerProfile]) {
        _containers = State(initialValue: containers.filter(\.isOpen))
    }

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if containers.isEmpty {
                    ContentUnavailableView("No open containers", systemImage: "shippingbox")
                } else {
                    InventoryOpenContainersPanel(containers: containers) { closed in
                        containers.removeAll { $0.id == closed.id }
                    }
                    .transition(.opacity)
                }
            }
            .inventoryMotion(value: containers.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .navigationTitle("Open containers")
        .playgroundTitleDisplay(large: true)
        .tint(.popsInventory)
    }
}

/// The open-containers screen before its records arrive.
internal struct InventoryOpenContainersSkeleton: View {
    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryLocationListSkeleton(rows: 4)
            }
            .padding(PopsSpacing.lg)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Open containers")
        .playgroundTitleDisplay(large: true)
        .accessibilityLabel("Loading")
    }
}
