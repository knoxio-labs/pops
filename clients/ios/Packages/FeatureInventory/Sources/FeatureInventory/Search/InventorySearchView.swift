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
    @State private var session: InventorySearchSession
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0

    internal init(model: InventorySearchViewModel, scan: @escaping () -> Void) {
        self.model = model
        self.scan = scan
        _session = State(
            initialValue: InventorySearchSession(
                store: model.store, writer: model.writer, runner: model.runner))
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PopsPageTitle(title: "Search")
                searchBar
                content
            }
            .popsMotion(value: model.query)
            .popsMotion(value: model.filter)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDismissesKeyboard(.immediately)
        .popsCollapsingTitle("Search")
        .popsGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(
                filter: $model.filter, types: model.results?.types ?? [])
        }
        .tint(.popsInventory)
        .inventorySearchChrome(session, records: searchResults, store: model.store)
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
        PopsSearchBar(
            query: $model.query,
            tint: .popsInventory,
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
            PopsListSkeleton(rows: 6)
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
                PopsCentredLine(text: emptyText)
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
        let results = searchResults
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: "Results", trailing: "\(results.count)")
            InventorySearchRows(results, query: model.trimmedQuery, session: session)
        }
    }

    private var searchResults: [InventorySearchResult] {
        model.hits.map(InventorySearchResult.init)
    }
}
