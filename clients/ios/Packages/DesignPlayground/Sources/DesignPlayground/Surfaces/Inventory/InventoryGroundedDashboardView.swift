import DesignSystem
import SwiftUI

internal enum InventoryGroundedSwipeRow: Hashable {
    case container(String)
    case inHand(String)
    case activity(String)
}

internal struct InventoryGroundedDashboardView: View {
    internal let fixture: InventoryDashboardFixture
    @Environment(\.dynamicTypeSize) internal var dynamicTypeSize
    @State internal var state: InventoryGroundedDashboardState
    @State internal var moveRequest: InventoryItem?
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
                    } else if fixture.sync != .current {
                        syncNotice
                    }
                    browse
                    if !state.inHandItems.isEmpty {
                        inHand
                    }
                    if !state.activities.isEmpty {
                        recentWork
                    }
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .refreshable {}
        .safeAreaInset(edge: .bottom) {
            if !fixture.isFirstRun {
                InventoryGlobalControls()
            }
        }
        .navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route)
        }
        .sheet(item: $moveRequest) { item in
            InventoryMoveDestinationSheet(
                item: item,
                containers: state.containers,
                onMove: { move(item) }
            )
        }
    }
}
