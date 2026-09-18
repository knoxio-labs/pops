import DesignSystem
import SwiftUI

/// What the search screen opens with, so each staged state is one value.
internal struct InventorySearchStage {
    internal enum Phase: Equatable {
        case ready
        case loading
        case firstLaunch
    }

    internal var query = ""
    internal var filter = InventorySearchFilter()
    internal var phase = Phase.ready
    /// Records whose local copy may be behind, drawn with their stale mark.
    internal var staleIDs: Set<String> = []
    internal var showsFilters = false
}

private struct InventoryScanRequest: Identifiable {
    let id = "scan"
}

/// The search tab: a large title, the Mail-style bar with the scan glyph in
/// it and the filter circle beside it, then recents while nothing is typed
/// and one ranked list of items, containers and places once something is.
internal struct InventorySearchScreen: View {
    internal let phase: InventorySearchStage.Phase
    internal let staleIDs: Set<String>
    internal var registersDestinations = true
    @State private var query: String
    @State private var filter: InventorySearchFilter
    @State private var recents = InventorySearchFixtures.recentQueries
    @State private var showingFilters: Bool
    @State private var scanning: InventoryScanRequest?
    @State private var edits = InventoryRecordEdits(InventorySearchFixtures.records)
    @State private var selection = InventorySelection()
    @State private var moving: InventoryRecordMoveRequest?
    @State private var offer: InventoryUndoOffer?

    internal init(
        stage: InventorySearchStage = InventorySearchStage(), registersDestinations: Bool = true
    ) {
        phase = stage.phase
        staleIDs = stage.staleIDs
        self.registersDestinations = registersDestinations
        _query = State(initialValue: stage.query)
        _filter = State(initialValue: stage.filter)
        _showingFilters = State(initialValue: stage.showsFilters)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Search")
                searchBar
                content
            }
            .inventoryMotion(value: query)
            .inventoryMotion(value: filter)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDismissesKeyboard(.immediately)
        .inventoryCollapsingTitle("Search")
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .inventoryDestinations(registersDestinations)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(filter: $filter, types: InventorySearchFixtures.types)
        }
        .playgroundStage(item: $scanning) { _ in
            InventoryScanView()
        }
        .tint(.popsInventory)
        .inventoryRecordSelectionBar(
            $edits, selection: $selection, all: hits.compactMap(recordID), moving: $moving,
            offer: $offer
        )
        .inventoryRecordActions($edits, selection: $selection, moving: $moving, offer: $offer)
    }

    private func recordID(_ hit: InventorySearchHit) -> String? {
        if case .record(let match) = hit { match.record.id } else { nil }
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query,
            prompt: "Items, containers, places",
            isFiltered: filter.isActive,
            filterSummary: filter.summary,
            onFilter: { showingFilters = true },
            scan: { scanning = InventoryScanRequest() }
        )
        .disabled(phase == .firstLaunch)
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .firstLaunch:
            InventoryFirstLaunchPrompt()
        case .loading:
            InventoryLocationListSkeleton(rows: 6)
        case .ready:
            if trimmedQuery.isEmpty {
                InventoryRecentSearches(
                    queries: $recents, scanned: InventorySearchFixtures.recentlyScanned,
                    onSelect: { query = $0 })
            } else if hits.isEmpty {
                InventoryCentredLine(text: emptyText)
            } else {
                results
            }
        }
    }

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var emptyText: String {
        filter.isActive
            ? "No matches with these filters" : "No results for \u{201C}\(trimmedQuery)\u{201D}"
    }

    private var hits: [InventorySearchHit] {
        let matches = InventorySearchEngine.search(query, in: edits.records)
            .filter { filter.matches($0.record) }
        var placeFilter = filter
        placeFilter.includesInactive = false
        let places =
            placeFilter.isActive ? [] : InventorySearchFixtures.places.matching(trimmedQuery)
        return InventorySearchRanking.rank(query, matches: matches, places: places)
    }

    private var results: some View {
        let hits = hits
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(title: "Results", trailing: "\(hits.count)")
            InventoryLocationPanel(rows: hits) { hit in
                InventorySearchHitRow(hit: hit, query: trimmedQuery, staleIDs: staleIDs)
                    .inventorySelectable(recordID(hit), in: $selection)
            }
        }
    }
}
