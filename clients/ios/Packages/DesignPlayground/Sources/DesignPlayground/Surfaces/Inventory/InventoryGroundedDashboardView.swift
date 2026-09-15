import DesignSystem
import SwiftUI

private enum InventoryGroundedSwipeRow: Hashable {
    case container(String)
    case inHand(String)
    case activity(String)
}

internal struct InventoryGroundedDashboardView: View {
    internal let fixture: InventoryDashboardFixture
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var state: InventoryGroundedDashboardState
    @State private var moveRequest: InventoryItem?
    @State private var selectedRoute: InventoryRoute?
    @State private var activeSwipeRow: InventoryGroundedSwipeRow?

    internal init(fixture: InventoryDashboardFixture) {
        self.fixture = fixture
        _state = State(initialValue: InventoryGroundedDashboardState(fixture: fixture))
    }

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if !state.containers.isEmpty {
                    openContainers
                }
                browse
                if !state.inHandItems.isEmpty {
                    inHand
                }
                recentWork
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .refreshable {}
        .safeAreaInset(edge: .bottom) {
            InventoryGlobalControls()
        }
        .navigationDestination(item: $selectedRoute) { route in
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

    private var openContainers: some View {
        InventoryGroundedOpenPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: PopsSpacing.md) {
                        openContainerSummary
                        Spacer(minLength: PopsSpacing.sm)
                        InventoryGroundedSyncStatus(state: fixture.sync)
                    }
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        openContainerSummary
                        InventoryGroundedSyncStatus(state: fixture.sync)
                    }
                }
                .padding(.bottom, PopsSpacing.sm)

                ForEach(state.containers) { container in
                    Button {
                        selectedRoute = .container(container.id)
                    } label: {
                        InventoryGroundedRowLabel(
                            title: container.name,
                            detail: "\(container.location) · \(container.updated)",
                            symbol: "shippingbox",
                            value: "\(container.itemCount)",
                            tone: .popsWarning
                        )
                    }
                    .buttonStyle(.plain)
                    .inventoryGroundedSwipeRow(
                        isActive: activeSwipeRow == .container(container.id))
                    .accessibilityElement(children: .combine)
                    .inventoryGroundedSwipeActions(
                        edge: .trailing,
                        onPresentationChanged: {
                            updateSwipePresentation(
                                .container(container.id), isPresented: $0)
                        }
                    ) {
                        Button {
                            close(container)
                        } label: {
                            Label("Close", systemImage: "checkmark.circle.fill")
                        }
                        .tint(.popsWarning)
                    }

                    if container.id != state.containers.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private var browse: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(title: "Browse")
            InventoryGroundedBrowseTile(
                title: "Items", count: "846", symbol: "cube",
                action: { selectedRoute = .items },
                prominence: .wide)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            } else {
                HStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            }
        }
        .padding(.horizontal, PopsSpacing.xs)
    }

    @ViewBuilder private var compactBrowseTiles: some View {
        InventoryGroundedBrowseTile(
            title: "Containers", count: "38", symbol: "shippingbox",
            action: { selectedRoute = .containers },
            prominence: .compact)
        InventoryGroundedBrowseTile(
            title: "Locations", count: "9", symbol: "house",
            action: { selectedRoute = .locations },
            prominence: .compact)
    }

    private var inHand: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "In hand", status: "\(state.inHandItems.count) awaiting placement")
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(state.inHandItems) { item in
                        Button {
                            selectedRoute = .item(item.id)
                        } label: {
                            InventoryGroundedRowLabel(
                                title: item.name, detail: item.detail, symbol: item.symbol)
                        }
                        .buttonStyle(.plain)
                        .inventoryGroundedSwipeRow(
                            isActive: activeSwipeRow == .inHand(item.id))
                        .inventoryGroundedSwipeActions(
                            edge: .leading,
                            onPresentationChanged: {
                                updateSwipePresentation(.inHand(item.id), isPresented: $0)
                            }
                        ) {
                            Button {
                                moveRequest = item
                            } label: {
                                Label("Move to…", systemImage: "folder.fill")
                            }
                            .tint(.popsAccent)
                        }
                        .inventoryGroundedSwipeActions(
                            edge: .trailing,
                            onPresentationChanged: {
                                updateSwipePresentation(.inHand(item.id), isPresented: $0)
                            }
                        ) {
                            Button {
                                putBack(item)
                            } label: {
                                Label("Put back", systemImage: "arrow.uturn.backward.circle.fill")
                            }
                            .tint(.popsSuccess)
                        }

                        if item.id != state.inHandItems.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    private var recentWork: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "Recent work", status: "See all", destination: .activity)
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(state.activities) { activity in
                        Button {
                            selectedRoute = .activity
                        } label: {
                            InventoryGroundedRowLabel(
                                title: activity.title,
                                detail: activity.detail,
                                symbol: activity.symbol)
                        }
                        .buttonStyle(.plain)
                        .inventoryGroundedSwipeRow(
                            isActive: activeSwipeRow == .activity(activity.id))
                        .inventoryGroundedSwipeActions(
                            edge: .trailing,
                            onPresentationChanged: {
                                updateSwipePresentation(.activity(activity.id), isPresented: $0)
                            }
                        ) {
                            Button {
                                undo(activity)
                            } label: {
                                Label("Undo", systemImage: "arrow.uturn.backward.circle.fill")
                            }
                            .tint(.popsAccent)
                        }

                        if activity.id != state.activities.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    private var openItemCount: Int {
        state.containers.reduce(0) { count, container in count + container.itemCount }
    }

    private var openContainerSummary: some View {
        Label {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(state.containers.count) open containers")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text("\(openItemCount) items in open containers")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        } icon: {
            Image(systemName: "shippingbox.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
    }

    private func close(_ container: InventoryContainer) {
        state.close(container)
    }

    private func putBack(_ item: InventoryItem) {
        state.putBack(item)
    }

    private func move(_ item: InventoryItem) {
        state.move(item)
        moveRequest = nil
    }

    private func undo(_ activity: InventoryActivity) {
        state.undo(activity)
    }

    private func updateSwipePresentation(
        _ row: InventoryGroundedSwipeRow,
        isPresented: Bool
    ) {
        if isPresented {
            activeSwipeRow = row
        } else if activeSwipeRow == row {
            activeSwipeRow = nil
        }
    }
}
