import AppCore
import DesignSystem
import SwiftUI

/// The search tab: a large title, the Mail-style bar with the scan glyph in
/// it and the filter circle beside it, then recents while nothing is typed
/// and one ranked list of items, containers and places once something is.
internal struct InventorySearchView: View {
    @Bindable internal var model: InventorySearchViewModel
    internal let scan: () -> Void
    @AppStorage(InventorySearchRecents.queriesKey) private var storedQueries = ""
    @AppStorage(InventorySearchRecents.scannedKey) private var storedScanned = ""
    @State private var showingFilters = false
    @State private var selection = InventorySelection()
    @State private var moving: InventoryPlacementRequest?
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Search")
                searchBar
                content
            }
            .inventoryMotion(value: model.query)
            .inventoryMotion(value: model.filter)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDismissesKeyboard(.immediately)
        .inventoryCollapsingTitle("Search")
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(
                filter: $model.filter, types: model.results?.types ?? [])
        }
        .tint(.popsInventory)
        .inventoryRecordSelectionBar(
            $selection, records: model.hitRecords, writer: model.writer, moving: $moving
        )
        .inventoryPlacementPicker($moving, runner: model.runner) { _ in
            selection.deselectAll()
        }
        .inventoryRunnerChrome(model.runner)
        .inventoryWriterFeedback(model.writer)
        .task(
            id: TaskKey(key: model.observationKey, scanned: storedScanned, generation: generation)
        ) {
            await model.observe(scannedIDs: InventorySearchRecents.decode(storedScanned))
        }
    }

    private struct TaskKey: Hashable {
        let key: InventoryObservationKey
        let scanned: String
        let generation: Int
    }

    private var recents: Binding<[String]> {
        Binding(
            get: { InventorySearchRecents.decode(storedQueries) },
            set: { storedQueries = InventorySearchRecents.encode($0) })
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $model.query,
            prompt: "Items, containers, places",
            isFiltered: model.filter.isActive,
            filterSummary: model.filter.summary,
            onFilter: { showingFilters = true },
            scan: scan,
            onSubmit: {
                recents.wrappedValue = InventorySearchRecents.adding(
                    model.query, to: recents.wrappedValue)
            }
        )
        .disabled(model.results?.isFirstRun ?? false)
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            InventoryLocationListSkeleton(rows: 6)
        case .unavailable:
            ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
        case .loaded(let results):
            if results.isFirstRun {
                InventoryFirstLaunchPrompt { Task { await model.download() } }
            } else if model.trimmedQuery.isEmpty {
                InventoryRecentSearches(
                    queries: recents, scanned: results.scanned,
                    onSelect: { model.query = $0 },
                    loadPhoto: { await model.thumbnail($0) })
            } else if model.hits.isEmpty {
                InventoryCentredLine(text: emptyText)
            } else {
                resultList
            }
        }
    }

    private var emptyText: String {
        model.filter.isActive
            ? "No matches with these filters"
            : "No results for \u{201C}\(model.trimmedQuery)\u{201D}"
    }

    private var resultList: some View {
        let hits = model.hits
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(title: "Results", trailing: "\(hits.count)")
            InventoryLocationPanel(rows: hits) { hit in
                InventorySearchHitRow(
                    hit: hit, query: model.trimmedQuery,
                    loadPhoto: { await model.thumbnail($0) }
                )
                .inventorySelectable(hit.recordID, in: $selection)
            }
        }
    }
}
