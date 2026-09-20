import DesignSystem
import SwiftUI

/// Every open container, full screen, in the dashboard's panel, with Close
/// on a trailing swipe.
internal struct InventoryOpenContainersView: View {
    @State private var model: InventoryOpenContainersModel
    @State private var generation = 0

    internal init(model: InventoryOpenContainersModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            switch model.containers.phase {
            case .loading:
                InventoryOpenContainersSkeleton()
            case .unavailable:
                InventoryUnavailableView { generation += 1 }
            case .loaded(let containers):
                content(containers)
            }
        }
        .task(id: generation) { await model.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private func content(_ containers: [InventoryContainerProfile]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if containers.isEmpty {
                    ContentUnavailableView("No open containers", systemImage: "shippingbox")
                } else {
                    InventoryOpenContainersPanel(containers: containers) { closed in
                        Task { await model.close(closed) }
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
        .inventoryTitleDisplay(large: true)
        .tint(.popsInventory)
    }
}

/// The open-containers page before its records arrive.
internal struct InventoryOpenContainersSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                        .fill(Color.popsSurface)
                        .frame(height: rowHeight)
                }
            }
            .popsShimmer()
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
        .inventoryTitleDisplay(large: true)
        .accessibilityLabel("Loading")
    }
}
