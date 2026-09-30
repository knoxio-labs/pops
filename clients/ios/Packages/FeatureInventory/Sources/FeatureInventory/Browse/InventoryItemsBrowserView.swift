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
                InventoryItemsBrowserSkeleton().transition(.opacity)
            case .unavailable:
                ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
                    .navigationTitle("Items")
                    .transition(.opacity)
            case .loaded:
                if let catalogue = model.catalogue { content(catalogue).transition(.opacity) }
            }
        }
        .popsMotion(value: model.phase)
        .task(id: TaskKey(key: model.observationKey, generation: generation)) {
            await model.observe()
        }
    }

    private struct TaskKey: Equatable {
        let key: InventoryObservationKey
        let generation: Int
    }

    private func content(_ catalogue: InventoryItemsCatalogue) -> some View {
        ScrollView(.vertical) {
            InventoryBrowserScrollContent {
                LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    PopsPageTitle(title: "Items")
                    if let offline = model.offlineLine {
                        InventoryLocationNoticeLine(
                            symbol: InventorySymbol.offline.system, tint: .popsWarning,
                            text: offline)
                    }
                    if catalogue.summary.activeItems == 0 && !model.filter.includesInactive
                        && !model.filter.isActive && model.query.isEmpty
                    {
                        PopsDashedActionButton(
                            title: "Add an item", symbol: InventorySymbol.item.system,
                            tint: .popsInventory
                        ) { itemForm?(.create(placement: nil)) }
                        .popsFadeIn()
                    } else {
                        InventoryCountTiles(tiles: model.tiles)
                        searchBar
                        list
                    }
                }
                .popsMotion(value: model.filter)
                .popsMotion(value: model.sort)
                .popsMotion(value: model.query)
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.bottom, PopsSpacing.xxl)
            }
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .scrollDismissesKeyboard(.immediately)
        .popsCollapsingTitle("Items")
        .background(Color.popsBackground)
        .sheet(isPresented: $showingFilters) {
            InventorySearchFilterSheet(
                filter: $model.filter, sort: $model.sort, types: catalogue.types)
        }
        .tint(.popsInventory)
        .chrome(selection: $selection, moving: $moving, model: model)
    }

    private var searchBar: some View {
        PopsSearchBar(
            query: $model.query,
            tint: .popsInventory,
            prompt: "Search items",
            isFiltered: model.filter.isActive || model.sort != .recent,
            filterSummary: model.filter.summary,
            onFilter: { showingFilters = true },
            add: PopsSearchBarAdd(label: "New item") { itemForm?(.create(placement: nil)) })
    }

    @ViewBuilder private var list: some View {
        let sections = model.sections
        if sections.isEmpty {
            PopsCentredLine(
                text: model.query.isEmpty
                    ? "No items with these filters"
                    : "No items match \u{201C}\(model.query)\u{201D}")
        } else {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        PopsSectionHeader(
                            title: section.title, trailing: "\(section.records.count)")
                        InventorySelectionPanel(rows: section.records) { record in
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
                            .onAppear {
                                if record.id == model.shown.last?.id {
                                    Task { await model.loadNextPage() }
                                }
                            }
                        }
                    }
                    .transition(PopsMotion.row)
                }
            }
            .popsMotion(value: sections.map(\.id))
        }
        if model.canLoadMore {
            if model.nextPageFailed {
                Button("Retry loading more") { Task { await model.retryNextPage() } }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PopsSpacing.md)
            } else if model.isLoadingNextPage {
                InventoryGroundedListPanel {
                    InventoryRowsSkeleton(rows: 1)
                }
                .transition(.opacity)
            }
        }
    }
}

internal struct InventoryBrowserScrollContent<Content: View>: View {
    private let content: Content

    internal init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    internal var body: some View {
        content
            .containerRelativeFrame(.horizontal, alignment: .leading)
    }
}

/// The browser before its items arrive.
internal struct InventoryItemsBrowserSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var fieldHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            InventoryBrowserScrollContent {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    PopsPageTitle(title: "Items")
                    VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                        InventoryCountTilesSkeleton(count: 4)
                        Capsule().fill(Color.popsSurface).frame(height: fieldHeight)
                    }
                    .popsShimmer()
                    InventoryRowsSkeleton(rows: 8)
                }
                .padding(.horizontal, PopsSpacing.lg)
            }
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Items")
        .popsTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("Items").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}

extension View {
    /// Move and the writer's Undo capsule and refusal presentation: the same chrome
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
