import DesignSystem
import SwiftUI

internal struct InventoryGroundedDashboardView: View {
    internal let fixture: InventoryDashboardFixture

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.xl) {
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
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                    Text("Open containers")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Spacer(minLength: PopsSpacing.sm)
                    InventoryGroundedSyncStatus(state: fixture.sync)
                }
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    Text("Open containers")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    InventoryGroundedSyncStatus(state: fixture.sync)
                }
            }

            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
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
                    .padding(.bottom, PopsSpacing.md)

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
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .fill(Color.popsWarning)
                    .frame(width: PopsBorder.emphasis)
                    .accessibilityHidden(true)
            }
        }
    }

    private var browse: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventoryGroundedSectionHeader(title: "Browse")
            PopsCard {
                VStack(spacing: PopsSpacing.zero) {
                    browseRow(
                        title: "Items", detail: "Browse, filter, and edit items",
                        symbol: "cube", value: "846", destination: .items)
                    PopsDivider()
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    browseRow(
                        title: "Containers", detail: "Review open and packed groups",
                        symbol: "shippingbox", value: "38", destination: .containers)
                    PopsDivider()
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    browseRow(
                        title: "Locations", detail: "Find items by room or storage area",
                        symbol: "house", value: "9", destination: .locations)
                }
            }
        }
    }

    @ViewBuilder private var inHand: some View {
        if !fixture.inHand.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryGroundedSectionHeader(
                    title: "In hand", status: "\(fixture.inHand.count) awaiting placement")
                PopsCard {
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
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventoryGroundedSectionHeader(
                title: "Recent work", status: "See all", destination: .activity)
            PopsCard {
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

    private func browseRow(
        title: String,
        detail: String,
        symbol: String,
        value: String,
        destination: InventoryRoute
    ) -> some View {
        NavigationLink(value: destination) {
            InventoryGroundedRowLabel(
                title: title,
                detail: detail,
                symbol: symbol,
                value: value,
                tone: .popsForeground
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}
