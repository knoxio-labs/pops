import DesignSystem
import SwiftUI

/// The complete Items or Containers browser: every record of one kind,
/// filterable and sortable the same way search is. One view for both, kept
/// distinct by `kind` alone, because the screen the ticket asks for is the
/// same shape twice and a second copy would drift from this one silently.
internal struct InventoryRecordBrowseView: View {
    internal let kind: InventorySearchKind
    internal var syncState: InventorySyncState = .current
    internal var isIndexing = false

    @State private var activeFilters: Set<InventorySearchFilter>
    @State private var sort: InventorySearchSort = .relevance
    @State private var showingFilters = false

    internal init(
        kind: InventorySearchKind,
        syncState: InventorySyncState = .current,
        isIndexing: Bool = false,
        presetFilters: Set<InventorySearchFilter> = []
    ) {
        self.kind = kind
        self.syncState = syncState
        self.isIndexing = isIndexing
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
        if isIndexing {
            InventoryStateNotice(kind: .loading)
        } else if allRecords.isEmpty {
            InventoryStateNotice(kind: .empty)
        } else if filteredRecords.isEmpty {
            InventoryFilteredEmptyView(
                matchCount: allRecords.count, query: nil, onClear: { activeFilters = [] })
        } else {
            list
        }
    }

    private var allRecords: [InventorySearchRecord] {
        InventorySearchFixtures.records.filter { $0.kind == kind }
    }

    private var filteredRecords: [InventorySearchRecord] {
        guard !activeFilters.isEmpty else { return allRecords }
        return allRecords.filter { record in activeFilters.allSatisfy { $0.matches(record) } }
    }

    private var sortedRecords: [InventorySearchRecord] {
        guard sort == .name else { return filteredRecords }
        return filteredRecords.sorted { $0.item.name < $1.item.name }
    }

    private var list: some View {
        List {
            InventorySearchSyncBanner(syncState: syncState)
            if !activeFilters.isEmpty {
                InventorySearchFilterChips(
                    filters: activeFilters, onRemove: { activeFilters.remove($0) }
                )
                .listRowSeparator(.hidden)
            }
            Section {
                ForEach(sortedRecords) { record in
                    InventorySearchResultRow(
                        match: InventorySearchMatch(record: record, facets: []))
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}
