import DesignSystem
import SwiftUI

/// How the browser orders the top-level places.
internal enum InventoryLocationSort: String, CaseIterable, Identifiable {
    case recorded
    case name
    case mostItems

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .recorded: "Recorded order"
        case .name: "Name"
        case .mostItems: "Most items"
        }
    }
}

/// Every place, opening on the top level: the counts, the search, then the
/// roots as rows that push their own page.
///
/// The design's Kind filter has nothing behind it: a location has no kind
/// (ADR-002), so the browser offers only a sort, not a filter.
internal struct InventoryLocationBrowserView: View {
    @State private var model: InventoryLocationBrowserModel
    @State private var generation = 0
    @State private var sort: InventoryLocationSort = .recorded

    internal init(model: InventoryLocationBrowserModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            switch model.tree.phase {
            case .loading: InventoryLocationBrowserSkeleton()
            case .unavailable: InventoryUnavailableView { generation += 1 }
            case .loaded(let tree): content(tree)
            }
        }
        .task(id: generation) { await model.tree.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private func roots(of tree: InventoryLocationTree) -> [InventoryLocationNode] {
        switch sort {
        case .recorded: tree.roots
        case .name: tree.roots.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .mostItems:
            tree.roots.sorted { tree.tally(of: $0.id).items > tree.tally(of: $1.id).items }
        }
    }

    private func content(_ tree: InventoryLocationTree) -> some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Locations")
                if tree.nodes.isEmpty {
                    firstRun
                } else {
                    InventoryCountTiles(tiles: tree.total.tiles)
                    searchBar
                    if model.query.isEmpty {
                        rootList(tree)
                    } else {
                        results(tree)
                    }
                }
            }
            .inventoryMotion(value: model.query.isEmpty)
            .inventoryMotion(value: sort)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryCollapsingTitle("Locations")
        .background(Color.popsBackground)
        .sheet(isPresented: $model.creating) {
            InventoryLocationCreateSheet(tree: tree, runner: model.runner)
        }
        .tint(.popsInventory)
    }

    private var searchBar: some View {
        @Bindable var model = model
        return InventorySearchBar(
            query: $model.query,
            prompt: "Search places",
            isFiltered: sort != .recorded,
            filterSummary: sort == .recorded ? "" : sort.title,
            add: InventorySearchBarAdd(label: "New place") { model.creating = true }
        ) {
            Picker("Sort", selection: $sort) {
                ForEach(InventoryLocationSort.allCases) { Text($0.title).tag($0) }
            }
        }
    }

    @ViewBuilder private func rootList(_ tree: InventoryLocationTree) -> some View {
        let places = roots(of: tree)
        if places.isEmpty {
            InventoryLocationEmptyLine(text: "No places")
        } else {
            InventoryLocationPanel(rows: places) { place in
                NavigationLink(value: InventoryRoute.place(place.id)) {
                    InventoryLocationRowLabel(place: place, tree: tree)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func results(_ tree: InventoryLocationTree) -> some View {
        let matches = tree.matching(model.query)
        if matches.isEmpty {
            InventoryLocationEmptyLine(text: "No places match \u{201C}\(model.query)\u{201D}")
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryLocationSectionHeader(title: "Places", trailing: "\(matches.count)")
                InventoryLocationPanel(rows: matches) { place in
                    NavigationLink(value: InventoryRoute.place(place.id)) {
                        InventoryLocationRowLabel(place: place, tree: tree, showsPath: true)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var firstRun: some View {
        InventoryAddPlaceButton { model.creating = true }
            .inventoryFadeIn()
    }
}
