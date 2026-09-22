import AppCore
import DesignSystem
import SwiftUI

extension InventoryDashboardView {
    internal func openContainers(_ dashboard: InventoryDashboard) -> some View {
        InventoryGroundedOpenPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                NavigationLink(value: InventoryRoute.openContainers) {
                    openContainerSummary(dashboard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shows every open container")
                .padding(.bottom, PopsSpacing.sm)

                ForEach(dashboard.openContainers) { container in
                    containerRow(container)
                        .transition(PopsMotion.row)
                    if container.id != dashboard.openContainers.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    internal func browse(_ dashboard: InventoryDashboard) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                Text("Browse")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                InventoryGroundedSyncStatus(state: dashboard.sync)
            }
            .frame(minHeight: PopsSize.touchTarget)
            InventoryGroundedBrowseTile(
                title: "Items", count: "\(dashboard.counts.items)", symbol: "cube",
                destination: .items,
                prominence: .wide)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: PopsSpacing.sm) { compactBrowseTiles(dashboard.counts) }
            } else {
                HStack(spacing: PopsSpacing.sm) { compactBrowseTiles(dashboard.counts) }
            }
        }
        .padding(.horizontal, PopsSpacing.xs)
    }

    @ViewBuilder internal func compactBrowseTiles(_ counts: InventoryCounts) -> some View {
        InventoryGroundedBrowseTile(
            title: "Containers", count: "\(counts.containers)", symbol: "shippingbox",
            destination: .containers,
            prominence: .compact)
        InventoryGroundedBrowseTile(
            title: "Locations", count: "\(counts.locations)", symbol: "house",
            destination: .locations,
            prominence: .compact)
    }

    internal func inHand(_ items: [InventoryDashboard.InHandItem]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "In hand", status: "\(items.count) awaiting placement",
                destination: .inHand, quiet: true)
            InventoryInHandRows(
                items: items, selection: $inHandSelection, onPutBack: putBack, onMove: move,
                loadPhoto: { await model.thumbnail($0) })
        }
    }

    internal func recentWork(_ activities: [InventoryDashboard.Activity]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(
                title: "Recent work", status: "See all", destination: .activity)
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(activities) { activity in
                        activityRow(activity)
                            .transition(PopsMotion.row)
                        if activity.id != activities.last?.id {
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

extension InventoryDashboardView {
    private func openContainerSummary(_ dashboard: InventoryDashboard) -> some View {
        let count = dashboard.openContainers.count
        return Label {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(count) open \(count == 1 ? "container" : "containers")")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .contentTransition(.numericText(value: Double(count)))
                Text("\(dashboard.openItemCount) items in open containers")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .contentTransition(.numericText(value: Double(dashboard.openItemCount)))
            }
        } icon: {
            Image(systemName: "shippingbox.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
    }

    private func containerRow(_ container: InventoryDashboard.OpenContainer) -> some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            InventoryGroundedRowLabel(
                title: container.name,
                detail: InventoryCopy.detail(
                    place: container.place, at: container.updatedAt),
                symbol: "shippingbox",
                value: "\(container.itemCount)",
                tone: .popsWarning
            )
        }
        .buttonStyle(.plain)
        .popsGroundedSwipeRow(isActive: activeSwipeRow == .container(container.id))
        .accessibilityElement(children: .combine)
        .popsGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: {
                updateSwipePresentation(.container(container.id), isPresented: $0)
            },
            actions: {
                Button {
                    Task { await model.close(container) }
                } label: {
                    Label("Close", systemImage: "checkmark.circle.fill")
                }
                .tint(.popsWarning)
            })
    }

    private func activityRow(_ activity: InventoryDashboard.Activity) -> some View {
        NavigationLink(value: activity.route ?? InventoryRoute.activity) {
            InventoryGroundedRowLabel(
                title: activity.title,
                detail: InventoryCopy.detail(place: activity.place, at: activity.at),
                symbol: activity.symbol)
        }
        .buttonStyle(.plain)
        .popsGroundedSwipeRow(isActive: activeSwipeRow == .activity(activity.id))
        .popsGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: {
                updateSwipePresentation(.activity(activity.id), isPresented: $0)
            },
            actions: {
                if activity.isUndoable {
                    Button {
                        Task { await model.undo(activity) }
                    } label: {
                        Label("Undo", systemImage: "arrow.uturn.backward.circle.fill")
                    }
                    .tint(.popsAccent)
                }
            })
    }

    private func updateSwipePresentation(_ row: InventoryGroundedSwipeRow, isPresented: Bool) {
        if isPresented {
            activeSwipeRow = row
        } else if activeSwipeRow == row {
            activeSwipeRow = nil
        }
    }
}
