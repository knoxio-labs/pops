import DesignSystem
import SwiftUI

internal enum InventoryGroundedSwipeRow: Hashable {
    case container(String)
    case activity(Int)
}

/// The Inventory tab's first screen: open containers, Browse, In hand and
/// Recent work, as the approved grounded dashboard draws them.
///
/// Move opens a pending sheet until the destination picker moves into this
/// package (POPS-4064). Selection mode on the In hand rows moves with the In
/// hand page (POPS-4065); until then a row's mark is only its mark.
internal struct InventoryDashboardView: View {
    @Bindable internal var model: InventoryDashboardViewModel
    @Environment(\.dynamicTypeSize) internal var dynamicTypeSize
    @State internal var activeSwipeRow: InventoryGroundedSwipeRow?
    @State private var moving: InventoryDashboard.InHandItem?
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
        .inventoryUndoCapsule($model.undoOffer) { offer in
            Task { await model.undo(offer) }
        }
        .sheet(item: $moving) { item in
            NavigationStack {
                InventoryPendingScreen(
                    title: "Move \(item.name)",
                    detail: "The place picker opens here.",
                    symbol: InventorySymbol.move.system)
            }
        }
        .alert(
            InventoryCopy.failureTitle,
            isPresented: Binding(
                get: { model.failure != nil }, set: { if !$0 { model.failure = nil } }),
            presenting: model.failure
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { failure in
            Text(InventoryCopy.message(for: failure))
        }
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
        moving = item
    }
}
