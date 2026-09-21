import DesignSystem
import SwiftUI

private struct SearchScanRequest: Identifiable {
    let id = "scan"
}

/// The app's one search tab: Inventory's search, extended to every pillar
/// that has moved to the iOS standard.
///
/// A large title, Inventory's Mail-style bar with the scan glyph in it and
/// the filter circle beside it, then a scope chip per pillar. Nothing typed
/// shows recents. Something typed shows each pillar's answer in its own
/// section, because the pillars answer at different speeds and one of them
/// can fail or be offline while another answers: Inventory from the replica
/// on the phone, at once; Purchases from the network, after a beat.
///
/// The tint follows the scope: a pillar's own colour when scoped to it, the
/// app's accent in All, where each section carries its pillar's colour. That
/// is why Inventory's shared parts here read their colour from
/// `inventoryAccent`.
internal struct UniversalSearchScreen: View {
    internal let staleIDs: Set<String>
    internal var registersDestinations = true
    @State internal var query: String
    @State internal var scope: SearchScope
    @State internal var answers: [SearchPillar: SearchAnswer]
    @State internal var inventoryFilter: InventorySearchFilter
    @State internal var purchasesFilter: PurchasesSearchFilter
    @State internal var recents: [SearchRecent]
    @State private var showingFilters: Bool
    @State private var scanning: SearchScanRequest?
    @State internal var edits = InventoryRecordEdits(InventorySearchFixtures.records)
    @State internal var selection = InventorySelection()
    @State private var moving: InventoryRecordMoveRequest?
    @State private var offer: InventoryUndoOffer?
    @State internal var resolving: Task<Void, Never>?
    private let scanned: [InventorySearchRecord]

    internal init(
        stage: UniversalSearchStage = UniversalSearchStage(), registersDestinations: Bool = true
    ) {
        staleIDs = stage.staleIDs
        scanned = stage.scanned
        self.registersDestinations = registersDestinations
        _query = State(initialValue: stage.query)
        _scope = State(initialValue: stage.scope)
        _answers = State(initialValue: stage.answers)
        _inventoryFilter = State(initialValue: stage.inventoryFilter)
        _purchasesFilter = State(initialValue: stage.purchasesFilter)
        _recents = State(initialValue: stage.recents)
        _showingFilters = State(initialValue: stage.showsFilters)
    }

    internal var model: UniversalSearchModel {
        UniversalSearchModel(
            query: query, scope: scope, answers: answers, inventoryRecords: edits.records,
            inventoryFilter: inventoryFilter, purchasesFilter: purchasesFilter)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Search")
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    searchBar
                    SearchScopeBar(scope: $scope, status: model.chipStatus)
                }
                content
            }
            .inventoryMotion(value: query)
            .inventoryMotion(value: scope)
            .inventoryMotion(value: answers)
            .inventoryMotion(value: inventoryFilter)
            .inventoryMotion(value: purchasesFilter)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDismissesKeyboard(.immediately)
        .inventoryCollapsingTitle("Search")
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .searchDestinations(inventory: registersDestinations)
        .sheet(isPresented: $showingFilters) {
            UniversalSearchFilterSheet(
                inventory: $inventoryFilter, purchases: $purchasesFilter, scope: scope)
        }
        .playgroundStage(item: $scanning) { _ in
            InventoryScanView()
        }
        .onChange(of: query) { previous, _ in requery(after: previous) }
        .environment(\.inventoryAccent, scope.tint)
        .tint(scope.tint)
        .inventoryRecordSelectionBar(
            $edits, selection: $selection, all: selectableIDs, moving: $moving, offer: $offer
        )
        .inventoryRecordActions($edits, selection: $selection, moving: $moving, offer: $offer)
    }

    private var selectableIDs: [String] {
        model.sections.flatMap { section -> [String] in
            guard case .results(let rows, _, _, _) = section.content else { return [] }
            return rows.compactMap(\.inventoryRecordID)
        }
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query,
            prompt: scope.prompt,
            isFiltered: model.isFiltered,
            filterSummary: filterSummary,
            onFilter: { showingFilters = true },
            scan: { scanning = SearchScanRequest() }
        )
    }

    private var filterSummary: String {
        [
            scope.includes(.inventory) ? inventoryFilter.summary : "",
            scope.includes(.purchases) ? purchasesFilter.summary : "",
        ]
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    }

    @ViewBuilder private var content: some View {
        let model = model
        if model.trimmedQuery.isEmpty {
            emptyQuery
        } else if model.hasNoResults {
            InventoryCentredLine(text: noResultsText)
        } else {
            ForEach(model.sections) { section in
                SearchSectionView(
                    section: section, isScoped: scope != .all, staleIDs: staleIDs,
                    selection: $selection, actions: sectionActions)
            }
        }
    }

    private var noResultsText: String {
        model.isFiltered
            ? "No matches with these filters"
            : "No results for \u{201C}\(model.trimmedQuery)\u{201D}"
    }

    @ViewBuilder private var emptyQuery: some View {
        SearchRecents(
            recents: $recents, scope: scope,
            scanned: scope.includes(.inventory) ? scanned : [],
            onSelect: { recent in
                scope = recent.scope
                query = recent.query
            })
        if scope.includes(.inventory), model.answer(for: .inventory) == .notOnPhone {
            VStack(spacing: PopsSpacing.lg) {
                InventoryCentredLine(text: "Inventory isn't on this phone yet")
                InventoryDashedActionButton(
                    title: "Download", symbol: InventorySymbol.update.system, action: download)
            }
            .inventoryFadeIn()
        }
    }

    private var sectionActions: SearchSectionActions {
        SearchSectionActions(
            showAll: { scope = .pillar($0) },
            retry: retry,
            download: download)
    }
}
