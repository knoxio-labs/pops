import DesignSystem
import SwiftUI

internal enum InventoryDashboardLayout {
    case composed, searchFirst, packingFirst, placeFirst, overview
}

internal struct InventoryDashboardView: View {
    internal let fixture: InventoryDashboardFixture
    internal let layout: InventoryDashboardLayout

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.xl) {
                statusHeader
                if fixture.isFirstRun {
                    firstRun
                } else {
                    dashboard
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
        .refreshable {}
        .safeAreaInset(edge: .bottom) {
            if layout == .composed {
                InventoryGlobalControls()
            }
        }
        .navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route)
        }
    }

    private var statusHeader: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .center, spacing: PopsSpacing.sm) {
                Text(fixture.isMoving ? "Packing now" : "At home")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                InventorySyncCapsule(state: fixture.sync)
            }
            Text(fixture.summary)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    @ViewBuilder private var dashboard: some View {
        switch layout {
        case .composed:
            openContainers
            destinations
            inHandItems
            recentActivity
        case .searchFirst:
            InventorySearchHero(prominent: true)
            destinations
            openContainers
            inHandItems
            recentActivity
        case .packingFirst:
            openContainers
            inHandItems
            InventorySearchHero(prominent: false)
            destinations
            recentActivity
        case .placeFirst:
            placeSummary
            destinations
            openContainers
            inHandItems
            recentActivity
        case .overview:
            overviewSummary
            recentItems
            openContainers
            inHandItems
            destinations
        }
    }

    private var destinations: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventorySectionHeader(title: "Browse", actionTitle: nil, destination: nil)
            InventoryDestinationCard(
                title: "Items", detail: "Every item, wherever it is", symbol: "cube",
                destination: .items)
            InventoryDestinationCard(
                title: "Containers", detail: "Open and packed", symbol: "shippingbox",
                destination: .containers)
            InventoryDestinationCard(
                title: "Locations", detail: "Rooms, storage, and places", symbol: "house",
                destination: .locations)
        }
    }
}

extension InventoryDashboardView {
    @ViewBuilder private var openContainers: some View {
        if !fixture.containers.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventorySectionHeader(
                    title: "Open containers",
                    actionTitle: "All containers", destination: .containers)
                ForEach(fixture.containers) { container in
                    InventoryOpenContainerCard(container: container)
                }
            }
        }
    }

    @ViewBuilder private var inHandItems: some View {
        if !fixture.inHand.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventorySectionHeader(title: "In hand", actionTitle: nil, destination: nil)
                ForEach(fixture.inHand) { item in
                    itemLink(item)
                }
            }
        }
    }

    private var recentItems: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventorySectionHeader(
                title: "Recent items", actionTitle: "All items", destination: .items)
            ForEach(fixture.recentItems) { item in
                itemLink(item)
            }
        }
    }

    private var recentActivity: some View {
        let indexedActivity = Array(fixture.activity.enumerated())
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventorySectionHeader(
                title: "Recent work", actionTitle: "See all", destination: .activity)
            PopsCard {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(indexedActivity, id: \.element.id) { index, activity in
                        NavigationLink(value: InventoryRoute.activity) {
                            Label {
                                PopsRow(title: activity.title, subtitle: activity.detail) {
                                    Image(systemName: "chevron.forward")
                                        .foregroundStyle(Color.popsMutedForeground)
                                }
                            } icon: {
                                Image(systemName: activity.symbol)
                                    .foregroundStyle(Color.popsAccent)
                                    .frame(minWidth: PopsSize.touchTarget)
                            }
                        }
                        .buttonStyle(.plain)
                        if index < fixture.activity.count - 1 {
                            PopsDivider()
                        }
                    }
                }
            }
        }
    }

    private var placeSummary: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventorySectionHeader(
                title: "Your places", actionTitle: "All locations", destination: .locations)
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Label("Home", systemImage: "house.fill")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Text("9 locations · 38 containers · 846 items")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                    NavigationLink(value: InventoryRoute.locations) {
                        Text("Open location map")
                            .font(.popsHeadline)
                            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var overviewSummary: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            InventorySectionHeader(title: "Inventory", actionTitle: nil, destination: nil)
            PopsCard {
                InventorySummaryFigures()
            }
            InventorySearchHero(prominent: false)
        }
    }

    private var firstRun: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                Image(systemName: "shippingbox.and.arrow.backward")
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                Text("Bring your inventory to this phone")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(
                    "Nothing has been removed. This phone needs its first catalogue before items, "
                        + "containers, and locations are available offline."
                )
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
                NavigationLink(value: InventoryRoute.syncRepair) {
                    Text("Start synchronization")
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.popsAccent)
                NavigationLink(value: InventoryRoute.syncRepair) {
                    Text("Why this phone is empty")
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func itemLink(_ item: InventoryItem) -> some View {
        NavigationLink(value: InventoryRoute.item(item.id)) {
            PopsCard {
                Label {
                    PopsRow(title: item.name, subtitle: item.detail) {
                        Image(systemName: "chevron.forward")
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                } icon: {
                    Image(systemName: item.symbol)
                        .foregroundStyle(Color.popsAccent)
                        .frame(minWidth: PopsSize.touchTarget)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
