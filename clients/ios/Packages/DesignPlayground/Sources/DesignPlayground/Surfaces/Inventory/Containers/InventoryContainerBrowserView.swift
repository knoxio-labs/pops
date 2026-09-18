import DesignSystem
import SwiftUI

/// Every container: the counts, the search with its filter and add circles,
/// the open ones in the dashboard's panel, then the rest, narrowed by
/// whatever the search bar's filter and query say.
internal struct InventoryContainerBrowserView: View {
    @State private var profiles: [InventoryContainerProfile]
    @State private var filter: InventoryContainerFilter
    @State private var query: String
    @State private var adding = false
    @Namespace private var rowSpace

    internal init(
        profiles: [InventoryContainerProfile],
        filter: InventoryContainerFilter = .all,
        query: String = ""
    ) {
        _profiles = State(initialValue: profiles)
        _filter = State(initialValue: filter)
        _query = State(initialValue: query)
    }

    private var filterMatched: [InventoryContainerProfile] {
        profiles.filter(filter.matches)
    }

    private var shown: [InventoryContainerProfile] {
        InventoryContainerSearchMatching.matching(query, in: filterMatched)
    }

    private var open: [InventoryContainerProfile] {
        shown.filter(\.isOpen)
    }

    private var rest: [InventoryContainerProfile] {
        shown.filter { !$0.isOpen }
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Containers")
                if profiles.isEmpty {
                    ContentUnavailableView("No containers", systemImage: "shippingbox")
                } else {
                    InventoryCountTiles(tiles: InventoryContainerStats(profiles).tiles)
                    searchBar
                    if filterMatched.isEmpty {
                        filteredEmpty
                            .transition(.opacity)
                    } else if shown.isEmpty {
                        InventoryCentredLine(
                            text: "No containers match \u{201C}\(query)\u{201D}"
                        )
                        .transition(.opacity)
                    } else {
                        if !open.isEmpty {
                            InventoryOpenContainersPanel(containers: open, rowSpace: rowSpace) {
                                close($0)
                            }
                            .transition(InventoryMotion.row)
                        }
                        if !rest.isEmpty {
                            restList
                                .transition(InventoryMotion.row)
                        }
                    }
                }
            }
            .inventoryMotion(value: filter)
            .inventoryMotion(value: query)
            .inventoryMotion(InventoryMotion.smooth, value: profiles.map(\.item.access))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .inventoryCollapsingTitle("Containers")
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .sheet(isPresented: $adding) {
            NavigationStack {
                InventoryItemFormView(draft: InventoryDraftFixtures.blank)
            }
        }
        .tint(.popsInventory)
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query,
            prompt: "Search containers",
            isFiltered: filter != .all,
            filterSummary: filter == .all ? "" : filter.title,
            add: InventorySearchBarAdd(label: "New container") { adding = true }
        ) {
            Picker("Filter", selection: $filter) {
                ForEach(InventoryContainerFilter.allCases) { option in
                    Text(option.title).tag(option)
                }
            }
        }
    }

    private func close(_ container: InventoryContainerProfile) {
        guard let index = profiles.firstIndex(where: { $0.id == container.id }) else { return }
        profiles[index] = profiles[index].closed()
    }

    private var restList: some View {
        InventoryGroundedListPanel {
            VStack(spacing: PopsSpacing.zero) {
                ForEach(rest) { profile in
                    NavigationLink {
                        InventoryContainerPage(profile: profile)
                    } label: {
                        InventoryContainerRowLabel(profile: profile)
                    }
                    .buttonStyle(.plain)
                    .matchedGeometryEffect(id: profile.id, in: rowSpace)
                    .transition(InventoryMotion.row)
                    if profile.id != rest.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private var filteredEmpty: some View {
        ContentUnavailableView {
            Label("No \(filter.title.lowercased()) containers", systemImage: "shippingbox")
        } actions: {
            Button("Show all") { filter = .all }
                .playgroundGlassButton()
        }
    }
}

extension InventoryContainerStats {
    /// Open, closed, full and total, in the order the strip shows them.
    internal var tiles: [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Open", count: open, symbol: "shippingbox", tone: .popsWarning),
            InventoryCountTile(title: "Closed", count: closed, symbol: "shippingbox.fill"),
            InventoryCountTile(title: "Full", count: full, symbol: "tray.full"),
            InventoryCountTile(title: "Total", count: total, symbol: "square.grid.2x2"),
        ]
    }
}

/// The browser before its records arrive.
internal struct InventoryContainerBrowserSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryCountTilesSkeleton(count: 4)
                Capsule().fill(Color.popsSurface).frame(height: rowHeight)
                VStack(spacing: PopsSpacing.sm) {
                    ForEach(0..<8, id: \.self) { _ in block(height: rowHeight) }
                }
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Containers")
        .playgroundTitleDisplay(large: true)
        .accessibilityLabel("Loading")
    }

    private func block(height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
            .fill(Color.popsSurface)
            .frame(height: height)
    }
}
