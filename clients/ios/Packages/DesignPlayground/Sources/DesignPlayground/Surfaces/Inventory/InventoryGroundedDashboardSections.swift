import DesignSystem
import SwiftUI

extension InventoryGroundedDashboardView {
    internal var openContainers: some View {
        InventoryGroundedOpenPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                openContainerSummary
                    .padding(.bottom, PopsSpacing.sm)

                ForEach(state.containers) { container in
                    containerRow(container)
                    if container.id != state.containers.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    internal var browse: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                Text("Browse")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                InventoryGroundedSyncStatus(state: fixture.sync)
            }
            .frame(minHeight: PopsSize.touchTarget)
            InventoryGroundedBrowseTile(
                title: "Items", count: "\(fixture.catalogue.items)", symbol: "cube",
                destination: .items,
                prominence: .wide)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            } else {
                HStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            }
        }
        .padding(.horizontal, PopsSpacing.xs)
    }

    @ViewBuilder internal var compactBrowseTiles: some View {
        InventoryGroundedBrowseTile(
            title: "Containers", count: "\(fixture.catalogue.containers)", symbol: "shippingbox",
            destination: .containers,
            prominence: .compact)
        InventoryGroundedBrowseTile(
            title: "Locations", count: "\(fixture.catalogue.locations)", symbol: "house",
            destination: .locations,
            prominence: .compact)
    }

    internal var inHand: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "In hand", status: "\(state.inHandItems.count) awaiting placement")
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(state.inHandItems) { item in
                        inHandRow(item)
                        if item.id != state.inHandItems.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    internal var recentWork: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "Recent work", status: "See all", destination: .activity)
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(state.activities) { activity in
                        activityRow(activity)
                        if activity.id != state.activities.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    internal var firstRun: some View {
        InventoryGroundedFirstRunPanel()
    }
}

extension InventoryGroundedDashboardView {
    private var openItemCount: Int {
        state.containers.reduce(0) { count, container in count + container.itemCount }
    }

    private var openContainerSummary: some View {
        Label {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(openContainerTitle)
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

    private var openContainerTitle: String {
        let noun = state.containers.count == 1 ? "container" : "containers"
        return "\(state.containers.count) open \(noun)"
    }

    private func containerRow(_ container: InventoryContainer) -> some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            InventoryGroundedRowLabel(
                title: container.name,
                detail: "\(container.location) · \(container.updated)",
                symbol: "shippingbox",
                value: "\(container.itemCount)",
                tone: .popsWarning
            )
        }
        .buttonStyle(.plain)
        .inventoryGroundedSwipeRow(isActive: activeSwipeRow == .container(container.id))
        .accessibilityElement(children: .combine)
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: {
                updateSwipePresentation(.container(container.id), isPresented: $0)
            },
            actions: {
                Button {
                    close(container)
                } label: {
                    Label("Close", systemImage: "checkmark.circle.fill")
                }
                .tint(.popsWarning)
            })
    }

    private func inHandRow(_ item: InventoryItem) -> some View {
        NavigationLink(value: InventoryRoute.item(item.id)) {
            InventoryGroundedRowLabel(title: item.name, detail: item.detail, symbol: item.symbol)
        }
        .buttonStyle(.plain)
        .inventoryGroundedSwipeRow(isActive: activeSwipeRow == .inHand(item.id))
        .inventoryGroundedSwipeActions(
            edge: .leading,
            onPresentationChanged: {
                updateSwipePresentation(.inHand(item.id), isPresented: $0)
            },
            actions: {
                Button {
                    moveRequest = item
                } label: {
                    Label("Move to…", systemImage: "folder.fill")
                }
                .tint(.popsAccent)
            }
        )
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: {
                updateSwipePresentation(.inHand(item.id), isPresented: $0)
            },
            actions: {
                Button {
                    putBack(item)
                } label: {
                    Label("Put back", systemImage: "arrow.uturn.backward.circle.fill")
                }
                .tint(.popsSuccess)
            })
    }

    private func activityRow(_ activity: InventoryActivity) -> some View {
        NavigationLink(value: InventoryRoute.activity) {
            InventoryGroundedRowLabel(
                title: activity.title,
                detail: activity.detail,
                symbol: activity.symbol)
        }
        .buttonStyle(.plain)
        .inventoryGroundedSwipeRow(isActive: activeSwipeRow == .activity(activity.id))
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: {
                updateSwipePresentation(.activity(activity.id), isPresented: $0)
            },
            actions: {
                Button {
                    undo(activity)
                } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward.circle.fill")
                }
                .tint(.popsAccent)
            })
    }
}

extension InventoryGroundedDashboardView {
    internal func close(_ container: InventoryContainer) {
        state.close(container)
    }

    internal func putBack(_ item: InventoryItem) {
        state.putBack(item)
    }

    internal func move(_ item: InventoryItem) {
        state.move(item)
        moveRequest = nil
    }

    internal func undo(_ activity: InventoryActivity) {
        state.undo(activity)
    }

    internal func updateSwipePresentation(
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
