import DesignSystem
import SwiftUI

internal enum InventoryGroundedSwipeRow: Hashable {
    case container(String)
    case activity(String)
}

internal struct InventoryGroundedDashboardView: View {
    internal let fixture: InventoryDashboardFixture
    @Environment(\.dynamicTypeSize) internal var dynamicTypeSize
    @State internal var state: InventoryGroundedDashboardState
    @State internal var moving: InventoryInHandMoveRequest?
    @State internal var offer: InventoryUndoOffer?
    @State internal var inHandSelection = InventorySelection()
    @State internal var activeSwipeRow: InventoryGroundedSwipeRow?

    internal init(fixture: InventoryDashboardFixture) {
        self.fixture = fixture
        _state = State(initialValue: InventoryGroundedDashboardState(fixture: fixture))
    }

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if fixture.isFirstRun {
                    firstRun
                } else {
                    if !state.containers.isEmpty {
                        openContainers
                    }
                    browse
                    if !state.inHand.isEmpty {
                        inHand
                    }
                    if !state.activities.isEmpty {
                        recentWork
                    }
                }
            }
            .inventoryMotion(value: state.containers.map(\.id))
            .inventoryMotion(value: state.inHand.items.map(\.id))
            .inventoryMotion(value: state.activities.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .refreshable {}
        .navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route)
        }
        .inventoryInHandSelectionBar(
            $inHandSelection, list: state.inHand,
            onPutBack: { ids in
                if let next = state.inHand.putBack(ids) { offer = next }
            },
            onMove: { moving = $0 }
        )
        .inventoryInHandActions($state.inHand, moving: $moving, offer: $offer)
    }
}
