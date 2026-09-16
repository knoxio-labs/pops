import DesignSystem
import SwiftUI

/// One row in the ranked layout, where an item, a container and a location
/// share a list with no headers between them.
private enum InventorySearchRankedRow: Identifiable {
    case match(InventorySearchMatch)
    case location(InventoryLocationRecord)

    fileprivate var id: String {
        switch self {
        case .match(let match): "match-\(match.id)"
        case .location(let location): "location-\(location.id)"
        }
    }
}

/// Global Inventory search: the active-search surface for typing, the
/// default screen before anything is typed, and every non-ordinary
/// condition, offline, stale, syncing, first sync required, filtered to
/// nothing.
///
/// A view rather than a fixed catalogue lookup, so the search tab and every
/// gallery state run the same matching and grouping code the real feature
/// would.
internal struct InventorySearchResults: View {
    internal let query: String
    internal var syncState: InventorySyncState = .current
    internal var isFirstRun = false
    internal var isIndexing = false
    internal var groupingStyle: InventorySearchGroupingStyle = .byKind
    internal var showsFilterChips = true
    internal var onSelectQuery: (String) -> Void = { _ in }

    @State private var activeFilters: Set<InventorySearchFilter>
    @State private var sort: InventorySearchSort = .relevance
    @State private var showingFilters = false

    internal init(
        query: String,
        syncState: InventorySyncState = .current,
        isFirstRun: Bool = false,
        isIndexing: Bool = false,
        groupingStyle: InventorySearchGroupingStyle = .byKind,
        presetFilters: Set<InventorySearchFilter> = [],
        showsFilterChips: Bool = true,
        onSelectQuery: @escaping (String) -> Void = { _ in }
    ) {
        self.query = query
        self.syncState = syncState
        self.isFirstRun = isFirstRun
        self.isIndexing = isIndexing
        self.groupingStyle = groupingStyle
        self.showsFilterChips = showsFilterChips
        self.onSelectQuery = onSelectQuery
        _activeFilters = State(initialValue: presetFilters)
    }

    internal var body: some View {
        content
            .environment(\.inventoryStyle, InventoryFoundationStyle(syncVisibility: .everything))
            .navigationDestination(for: InventoryRoute.self) { InventoryDestinationView(route: $0) }
            .playgroundTrailingBarItem {
                InventorySearchFilterButton(hasActiveFilters: !activeFilters.isEmpty) {
                    showingFilters = true
                }
            }
            .sheet(isPresented: $showingFilters) {
                NavigationStack {
                    InventorySearchFilterSheet(activeFilters: $activeFilters, sort: $sort)
                }
            }
    }

    @ViewBuilder private var content: some View {
        if isFirstRun {
            InventoryStateNotice(kind: .unavailable)
        } else if isIndexing {
            InventoryStateNotice(kind: .loading)
        } else if trimmedQuery.isEmpty {
            defaultList
        } else if rawMatches.isEmpty && matchingLocations.isEmpty {
            ContentUnavailableView.search(text: query)
        } else if filteredMatches.isEmpty && matchingLocations.isEmpty {
            filteredEmptyView
        } else {
            resultsList
        }
    }

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var rawMatches: [InventorySearchMatch] {
        InventorySearchEngine.search(query, in: InventorySearchFixtures.records)
    }

    private var filteredMatches: [InventorySearchMatch] {
        guard !activeFilters.isEmpty else { return rawMatches }
        return rawMatches.filter { match in activeFilters.allSatisfy { $0.matches(match.record) } }
    }

    private var matchingLocations: [InventoryLocationRecord] {
        InventorySearchFixtures.locations.filter { $0.matches(trimmedQuery) }
    }

    private var groups: [InventorySearchGroup] {
        InventorySearchGrouping.groups(
            for: filteredMatches.sorted(by: sort), locations: matchingLocations,
            style: groupingStyle)
    }

    private var rankedRows: [InventorySearchRankedRow] {
        filteredMatches.sorted(by: sort).map(InventorySearchRankedRow.match)
            + matchingLocations.map(InventorySearchRankedRow.location)
    }

    private var defaultList: some View {
        List {
            InventoryRecentSearches(
                queries: InventorySearchFixtures.recentQueries,
                scanned: InventorySearchFixtures.recentlyScanned,
                onSelectQuery: onSelectQuery)
        }
        .playgroundInsetGroupedList()
    }

    private var filteredEmptyView: some View {
        InventoryFilteredEmptyView(
            matchCount: rawMatches.count, query: query, onClear: { activeFilters = [] })
    }

    @ViewBuilder private var resultsList: some View {
        List {
            InventorySearchSyncBanner(syncState: syncState)
            if showsFilterChips && !activeFilters.isEmpty {
                InventorySearchFilterChips(
                    filters: activeFilters, onRemove: { activeFilters.remove($0) }
                )
                .listRowSeparator(.hidden)
            }
            if groupingStyle == .ranked {
                Section { rankedRowsContent }
            } else {
                ForEach(groups) { group in
                    Section {
                        groupContent(group)
                    } header: {
                        InventorySearchGroupHeader(group: group)
                    }
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    @ViewBuilder private var rankedRowsContent: some View {
        ForEach(rankedRows) { row in
            switch row {
            case .match(let match): InventorySearchResultRow(match: match)
            case .location(let location): InventorySearchLocationRow(location: location)
            }
        }
    }

    @ViewBuilder
    private func groupContent(_ group: InventorySearchGroup) -> some View {
        switch group {
        case .items(let matches), .containers(let matches):
            ForEach(matches) { InventorySearchResultRow(match: $0) }
        case .locations(let locations):
            ForEach(locations) { InventorySearchLocationRow(location: $0) }
        }
    }
}
