import AppCore
import DesignSystem
import SwiftUI

/// Every item: the counts, the search with its filter and add circles, then
/// the items in sections by the sort the filter sheet sets.
internal struct InventoryItemsBrowserView: View {
    @State private var model: InventoryItemsBrowserViewModel
    @State private var showingFilters = false
    @State private var selection = InventorySelection()
    @Environment(\.inventoryItemForm) private var itemForm
    @State private var moving: InventoryPlacementRequest?
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0

    internal init(store: any InventoryStore) {
        _model = State(wrappedValue: InventoryItemsBrowserViewModel(store: store))
    }

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                InventoryItemsBrowserSkeleton()
            case .unavailable:
                ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
                    .navigationTitle("Items")
            case .loaded(let catalogue):
                content(catalogue)
            }
        }
        .task(id: TaskKey(key: model.observationKey, generation: generation)) {
            await model.observe()
        }
    }

    private struct TaskKey: Hashable {
        let key: InventoryObservationKey
        let generation: Int
    }

    private func content(_ catalogue: InventoryItemsCatalogue) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Items")
                if let offline = model.offlineLine {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.offline.system, tint: .popsWarning, text: offline)
                }
                if catalogue.records.isEmpty {
                    InventoryDashedActionButton(
                        title: "Add an item", symbol: InventorySymbol.item.system
                    ) { itemForm?(.create(placement: nil)) }
                    .inventoryFadeIn()
                } else {
                    InventoryCountTiles(tiles: model.tiles)
                    searchBar
                    list
                }
            }
            .inventoryMotion(value: model.filter)
            .inventoryMotion(value: model.sort)
            .inventoryMotion(value: model.query)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .scrollDismissesKeyboard(.immediately)
        .inventoryCollapsingTitle("Items")
        .background(Color.popsBackground)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(
                filter: $model.filter, sort: $model.sort, types: catalogue.types)
        }
        .tint(.popsInventory)
        .chrome(selection: $selection, moving: $moving, model: model)
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $model.query,
            prompt: "Search items",
            isFiltered: model.filter.isActive || model.sort != .recent,
            filterSummary: model.filter.summary,
            onFilter: { showingFilters = true },
            add: InventorySearchBarAdd(label: "New item") { itemForm?(.create(placement: nil)) })
    }

    @ViewBuilder private var list: some View {
        let sections = model.sections
        if sections.isEmpty {
            InventoryCentredLine(
                text: model.query.isEmpty
                    ? "No items with these filters"
                    : "No items match \u{201C}\(model.query)\u{201D}")
        } else {
            ForEach(sections) { section in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(
                        title: section.title, trailing: "\(section.records.count)")
                    InventoryLocationPanel(rows: section.records) { record in
                        NavigationLink(
                            value: InventoryRoute.record(
                                id: record.id, isContainer: record.isContainer)
                        ) {
                            InventoryRecordRowLabel(
                                record: record, query: model.query, showsCode: true,
                                loadPhoto: { await model.thumbnail($0) })
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
        .inventoryTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("Items").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}

extension View {
    /// Move and the writer's Undo capsule and refusal alert: the same chrome
    /// every list in this package shows, over its own selection and model.
    fileprivate func chrome(
        selection: Binding<InventorySelection>, moving: Binding<InventoryPlacementRequest?>,
        model: InventoryItemsBrowserViewModel
    ) -> some View {
        inventoryRecordSelectionBar(
            selection, records: model.shown, writer: model.writer, moving: moving
        )
        .inventoryPlacementPicker(moving, runner: model.runner) { _ in
            selection.wrappedValue.deselectAll()
        }
        .inventoryRunnerChrome(model.runner)
        .inventoryWriterFeedback(model.writer)
    }
}
