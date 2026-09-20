import DesignSystem
import SwiftUI

internal enum InventoryGroundedSwipeRow: Hashable {
    case container(String)
    case activity(Int)
}

/// The Inventory tab's first screen: open containers, Browse, In hand and
/// Recent work, as the approved grounded dashboard draws them.
///
/// A row's mark selects it, and selecting In hand rows puts the In hand
/// page's Put back and Move bar in place of the tab bar. Move opens the one
/// placement picker every screen in this package shares.
internal struct InventoryDashboardView: View {
    @Bindable internal var model: InventoryDashboardViewModel
    @Environment(\.dynamicTypeSize) internal var dynamicTypeSize
    @State internal var activeSwipeRow: InventoryGroundedSwipeRow?
    @State internal var inHandSelection = InventorySelection()
    @State private var moving: InventoryPlacementRequest?
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                InventoryDashboardSkeleton()
            case .unavailable:
                ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
            case .loaded(let dashboard):
                content(dashboard)
            }
        }
        .task(id: generation) { await model.observe() }
        .inventoryWriterFeedback(model.writer)
        .inventoryInHandSelectionBar(
            $inHandSelection, items: model.dashboard?.inHand ?? [],
            onPutBack: { ids in Task { await model.putBack(ids) } },
            onMove: { moving = $0 }
        )
        .inventoryPlacementPicker($moving, runner: model.runner) { _ in
            inHandSelection.deselectAll()
        }
        .inventoryTypeArrivedSheet(model.typeArrival)
        .inventoryRunnerChrome(model.runner)
    }

    private func content(_ dashboard: InventoryDashboard) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if dashboard.isFirstRun {
                    firstRun
                } else {
                    if !dashboard.openContainers.isEmpty {
                        openContainers(dashboard)
                    }
                    browse(dashboard)
                    if !dashboard.inHand.isEmpty {
                        inHand(dashboard.inHand)
                    }
                    if !dashboard.recentWork.isEmpty {
                        recentWork(dashboard.recentWork)
                    }
                }
            }
            .inventoryMotion(value: dashboard.openContainers.map(\.id))
            .inventoryMotion(value: dashboard.inHand.map(\.id))
            .inventoryMotion(value: dashboard.recentWork.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .refreshable { await model.refresh() }
    }

    internal func putBack(_ item: InventoryDashboard.InHandItem) {
        Task { await model.putBack(item) }
    }

    internal func move(_ item: InventoryDashboard.InHandItem) {
        moving = InventoryInHand.moveRequest(for: [item])
    }
}
