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
                InventoryOpenContainersSkeleton().transition(.opacity)
            case .unavailable:
                InventoryUnavailableView { generation += 1 }.transition(.opacity)
            case .loaded(let containers):
                content(containers).transition(.opacity)
            }
        }
        .popsMotion(value: model.containers.phase)
        .task(id: generation) { await model.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private func content(_ containers: [InventoryContainerProfile]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if containers.isEmpty {
                    ContentUnavailableView("No open containers", systemImage: "shippingbox")
                } else {
                    InventoryOpenContainersPanel(containers: containers) { closed in
                        Task { await model.close(closed) }
                    }
                    .transition(.opacity)
                }
            }
            .popsMotion(value: containers.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .popsGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .navigationTitle("Open containers")
        .popsTitleDisplay(large: true)
        .tint(.popsInventory)
    }
}

/// The open-containers page before its records arrive.
internal struct InventoryOpenContainersSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .caption) private var lineHeight = PopsSpacing.sm

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.md) {
                    RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                        .fill(Color.popsSeparator)
                        .frame(width: markSize, height: markSize)
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Capsule()
                            .fill(Color.popsSeparator)
                            .frame(width: markSize * 2, height: lineHeight)
                        Capsule()
                            .fill(Color.popsSeparator)
                            .frame(width: markSize * 3, height: lineHeight)
                    }
                }
                .popsShimmer()
                InventoryRowsSkeleton(rows: 4)
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
        .popsTitleDisplay(large: true)
        .accessibilityLabel("Loading")
    }
}
