import DesignSystem
import SwiftUI

internal struct InventoryGroundedDashboardView: View {
    internal let fixture: InventoryDashboardFixture
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                openContainers
                browse
                inHand
                recentWork
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
        .refreshable {}
        .safeAreaInset(edge: .bottom) {
            InventoryGlobalControls()
        }
        .navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route)
        }
    }

    private var openContainers: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            PopsCard {
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

                    PopsDivider()

                    ForEach(fixture.containers) { container in
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
                        .accessibilityElement(children: .combine)

                        if container.id != fixture.containers.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsWarning, lineWidth: PopsBorder.hairline)
                    .accessibilityHidden(true)
            }
        }
    }

    private var browse: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(title: "Browse")
            InventoryGroundedBrowseTile(
                title: "Items", count: "846", detail: "Browse, filter, and edit items",
                symbol: "cube", destination: .items, prominence: .wide)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            } else {
                HStack(spacing: PopsSpacing.sm) { compactBrowseTiles }
            }
        }
    }

    @ViewBuilder private var compactBrowseTiles: some View {
        InventoryGroundedBrowseTile(
            title: "Containers", count: "38", detail: "Review open and packed groups",
            symbol: "shippingbox", destination: .containers, prominence: .compact)
        InventoryGroundedBrowseTile(
            title: "Locations", count: "9", detail: "Find by room or storage area",
            symbol: "house", destination: .locations, prominence: .compact)
    }

    @ViewBuilder private var inHand: some View {
        if !fixture.inHand.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                InventoryGroundedSectionHeader(
                    title: "In hand", status: "\(fixture.inHand.count) awaiting placement")
                InventoryGroundedListPanel {
                    VStack(spacing: PopsSpacing.zero) {
                        ForEach(fixture.inHand) { item in
                            NavigationLink(value: InventoryRoute.item(item.id)) {
                                InventoryGroundedRowLabel(
                                    title: item.name, detail: item.detail, symbol: item.symbol)
                            }
                            .buttonStyle(.plain)

                            if item.id != fixture.inHand.last?.id {
                                PopsDivider()
                                    .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                            }
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
                    ForEach(fixture.activity) { activity in
                        NavigationLink(value: InventoryRoute.activity) {
                            InventoryGroundedRowLabel(
                                title: activity.title,
                                detail: activity.detail,
                                symbol: activity.symbol)
                        }
                        .buttonStyle(.plain)

                        if activity.id != fixture.activity.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    private var openItemCount: Int {
        fixture.containers.reduce(0) { count, container in count + container.itemCount }
    }

    private var openContainerSummary: some View {
        Label {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(fixture.containers.count) open containers")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text("\(openItemCount) items still being packed")
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
}
