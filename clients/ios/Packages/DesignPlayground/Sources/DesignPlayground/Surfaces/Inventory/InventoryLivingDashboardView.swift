import DesignSystem
import SwiftUI

internal struct InventoryLivingDashboardView: View {
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
        let indexedContainers = Array(fixture.containers.enumerated())
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                    openContainerHeadline
                    Spacer(minLength: PopsSpacing.sm)
                    InventorySyncCapsule(state: fixture.sync)
                }
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    openContainerHeadline
                    InventorySyncCapsule(state: fixture.sync)
                }
            }

            Text("The things still being packed, all in one place.")
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)

            VStack(spacing: PopsSpacing.zero) {
                ForEach(indexedContainers, id: \.element.id) { index, container in
                    InventoryLivingContainerRow(container: container)
                    if index < fixture.containers.count - 1 {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }

            NavigationLink(value: InventoryRoute.containers) {
                Label("All containers", systemImage: "arrow.right")
                    .labelStyle(.titleAndIcon)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsWarning)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.plain)
        }
        .padding(PopsSpacing.lg)
        .background(alignment: .topTrailing) {
            InventoryWarningWash()
        }
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    private var openContainerHeadline: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text("OPEN CONTAINERS")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Text("\(fixture.containers.count) in motion")
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
        }
    }

    private var browse: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventoryLivingSectionLabel(title: "Browse", note: "Everything has a place")
            InventoryLivingBrowseTile(
                title: "Items", count: "846", detail: "Across your whole inventory",
                symbol: "cube.fill", destination: .items, prominence: .wide)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: PopsSpacing.md) { compactBrowseTiles }
                VStack(spacing: PopsSpacing.md) { compactBrowseTiles }
            }
        }
    }

    @ViewBuilder private var compactBrowseTiles: some View {
        InventoryLivingBrowseTile(
            title: "Containers", count: "38", detail: "Open and packed",
            symbol: "shippingbox.fill", destination: .containers, prominence: .compact)
        InventoryLivingBrowseTile(
            title: "Locations", count: "9", detail: "Rooms and storage",
            symbol: "house.fill", destination: .locations, prominence: .compact)
    }

    @ViewBuilder private var inHand: some View {
        if !fixture.inHand.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryLivingSectionLabel(title: "In hand", note: "Between places")
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(fixture.inHand) { item in
                        InventoryLivingItemRow(item: item)
                        if item.id != fixture.inHand.last?.id {
                            PopsDivider()
                                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
                .padding(.horizontal, PopsSpacing.md)
                .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            }
        }
    }

    private var recentWork: some View {
        let indexedActivity = Array(fixture.activity.enumerated())
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventoryLivingSectionLabel(
                title: "Recent work", note: "See all", destination: .activity)
            VStack(spacing: PopsSpacing.zero) {
                ForEach(indexedActivity, id: \.element.id) { index, activity in
                    InventoryLivingActivityRow(activity: activity)
                    if index < fixture.activity.count - 1 {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
            .padding(.horizontal, PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        }
    }
}
