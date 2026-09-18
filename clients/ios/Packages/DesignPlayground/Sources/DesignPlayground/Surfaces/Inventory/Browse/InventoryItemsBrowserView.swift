import DesignSystem
import SwiftUI

/// Every item: the counts, the search with its filter and add circles, then
/// the items in sections by the sort the filter sheet sets.
internal struct InventoryItemsBrowserView: View {
    internal var offline: String?
    internal var registersDestinations = true
    @State private var query = ""
    @State private var filter: InventorySearchFilter
    @State private var sort: InventoryItemSort
    @State private var showingFilters = false
    @State private var adding = false
    @State private var edits: InventoryRecordEdits
    @State private var selection: InventorySelection
    @State private var moving: InventoryRecordMoveRequest?
    @State private var offer: InventoryUndoOffer?

    internal init(
        records: [InventorySearchRecord] = InventorySearchFixtures.records.filter {
            $0.kind == .item
        },
        filter: InventorySearchFilter = InventorySearchFilter(),
        sort: InventoryItemSort = .recent,
        offline: String? = nil,
        registersDestinations: Bool = true,
        selected: Set<String> = []
    ) {
        _edits = State(initialValue: InventoryRecordEdits(records))
        _selection = State(initialValue: InventorySelection(selected))
        self.offline = offline
        self.registersDestinations = registersDestinations
        _filter = State(initialValue: filter)
        _sort = State(initialValue: sort)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Items")
                if let offline {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.offline.system, tint: .popsWarning, text: offline)
                }
                if edits.records.isEmpty {
                    InventoryDashedActionButton(
                        title: "Add an item", symbol: InventorySymbol.item.system
                    ) { adding = true }
                    .inventoryFadeIn()
                } else {
                    InventoryCountTiles(tiles: tiles)
                    searchBar
                    list
                }
            }
            .inventoryMotion(value: filter)
            .inventoryMotion(value: sort)
            .inventoryMotion(value: query)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .scrollDismissesKeyboard(.immediately)
        .inventoryCollapsingTitle("Items")
        .background(Color.popsBackground)
        .inventoryDestinations(registersDestinations)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(
                filter: $filter, sort: $sort, types: InventorySearchFixtures.types)
        }
        .sheet(isPresented: $adding) {
            NavigationStack {
                InventoryItemFormView(draft: InventoryDraftFixtures.blank)
            }
        }
        .tint(.popsInventory)
        .inventoryRecordSelectionBar(
            $edits, selection: $selection, all: shown.map(\.id), moving: $moving, offer: $offer,
            extra: [
                InventorySelectionAction(title: "Label", symbol: .printLabel) { ids in
                    let noun = ids.count == 1 ? "label" : "labels"
                    offer = InventoryUndoOffer(
                        message: "Printing \(ids.count) \(noun)", symbol: .printLabel)
                    selection.deselectAll()
                }
            ]
        )
        .inventoryRecordActions($edits, selection: $selection, moving: $moving, offer: $offer)
    }

    private var active: [InventorySearchRecord] {
        edits.records.filter { $0.item.lifecycle == .active }
    }

    private var tiles: [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Items", count: active.count, symbol: InventorySymbol.item.system),
            InventoryCountTile(
                title: "In hand", count: active.filter(\.item.placement.isInHand).count,
                symbol: InventorySymbol.inHand.system),
            InventoryCountTile(
                title: "Untyped", count: active.filter { $0.item.typeName == nil }.count,
                symbol: InventorySymbol.waiting.system),
            InventoryCountTile(
                title: "Recent", count: active.filter(\.isRecent).count,
                symbol: InventorySymbol.activity.system),
        ]
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query,
            prompt: "Search items",
            isFiltered: filter.isActive || sort != .recent,
            filterSummary: filter.summary,
            onFilter: { showingFilters = true },
            add: InventorySearchBarAdd(label: "New item") { adding = true })
    }

    private var shown: [InventorySearchRecord] {
        let kept = edits.records.filter(filter.matches)
        let matched =
            query.trimmingCharacters(in: .whitespaces).isEmpty
            ? kept
            : InventorySearchEngine.search(query, in: kept).map(\.record)
        switch sort {
        case .recent: return matched.sorted { $0.addedDaysAgo < $1.addedDaysAgo }
        case .name:
            return matched.sorted {
                $0.item.name.localizedCompare($1.item.name) == .orderedAscending
            }
        }
    }

    private var sections: [InventoryItemSection] {
        InventoryItemSection.sections(shown, by: sort)
    }

    @ViewBuilder private var list: some View {
        let sections = sections
        if sections.isEmpty {
            InventoryCentredLine(
                text: query.isEmpty
                    ? "No items with these filters" : "No items match \u{201C}\(query)\u{201D}")
        } else {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(
                        title: section.title, trailing: "\(section.records.count)")
                    InventoryLocationPanel(rows: section.records) { record in
                        NavigationLink(value: InventoryRoute.record(record)) {
                            InventoryRecordRowLabel(record: record, query: query, showsCode: true)
                        }
                        .buttonStyle(.plain)
                        .inventorySelectable(record.id, in: $selection)
                    }
                }
                .transition(.opacity)
            }
        }
    }
}

/// One titled run of the Items list.
internal struct InventoryItemSection: Identifiable, Equatable {
    internal let title: String
    internal let records: [InventorySearchRecord]

    internal var id: String { title }

    /// This week and earlier when sorted by recency; one section per initial
    /// when sorted by name. Records keep the order they arrive in, and empty
    /// sections are left out.
    internal static func sections(
        _ records: [InventorySearchRecord], by sort: InventoryItemSort
    ) -> [InventoryItemSection] {
        switch sort {
        case .recent:
            return [
                InventoryItemSection(title: "This week", records: records.filter(\.isRecent)),
                InventoryItemSection(
                    title: "Earlier", records: records.filter { !$0.isRecent }),
            ]
            .filter { !$0.records.isEmpty }
        case .name:
            var order: [String] = []
            var grouped: [String: [InventorySearchRecord]] = [:]
            for record in records {
                let initial = record.item.name.prefix(1).uppercased()
                if grouped[initial] == nil { order.append(initial) }
                grouped[initial, default: []].append(record)
            }
            return order.map { InventoryItemSection(title: $0, records: grouped[$0] ?? []) }
        }
    }
}

/// The browser before its items arrive.
internal struct InventoryItemsBrowserSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var fieldHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Items")
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    InventoryCountTilesSkeleton(count: 4)
                    Capsule().fill(Color.popsSurface).frame(height: fieldHeight)
                }
                .popsShimmer()
                InventoryLocationListSkeleton(rows: 8)
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Items")
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("Items").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}
