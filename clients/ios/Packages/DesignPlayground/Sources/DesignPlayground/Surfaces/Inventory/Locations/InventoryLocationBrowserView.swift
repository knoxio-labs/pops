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

/// Every place, opening on the top level: the counts, the search with its
/// filter and add circles, then the roots as rows that push their own page.
internal struct InventoryLocationBrowserView: View {
    internal let tree: InventoryLocationTree
    internal var offline: String?
    @State private var query: String
    @State private var sort: InventoryLocationSort = .recorded
    @State private var kind: InventoryPlaceKind?
    @State private var creating = false

    internal init(tree: InventoryLocationTree, query: String = "", offline: String? = nil) {
        self.tree = tree
        self.offline = offline
        _query = State(initialValue: query)
    }

    private var roots: [InventoryLocationNode] {
        let kept = tree.roots.filter { kind == nil || $0.kind == kind }
        switch sort {
        case .recorded: return kept
        case .name: return kept.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .mostItems:
            return kept.sorted { tree.tally(of: $0.id).items > tree.tally(of: $1.id).items }
        }
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "Locations")
                if let offline {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.offline.system, tint: .popsWarning, text: offline)
                }
                if tree.nodes.isEmpty {
                    firstRun
                } else {
                    InventoryCountTiles(tiles: tree.total.tiles)
                    searchBar
                    if query.isEmpty { rootList } else { results }
                }
            }
            .inventoryMotion(value: query.isEmpty)
            .inventoryMotion(value: sort)
            .inventoryMotion(value: kind)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryCollapsingTitle("Locations")
        .background(Color.popsBackground)
        .sheet(isPresented: $creating) {
            InventoryLocationCreateSheet(tree: tree)
        }
        .tint(.popsInventory)
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query,
            prompt: "Search places",
            isFiltered: kind != nil || sort != .recorded,
            filterSummary: filterSummary,
            add: InventorySearchBarAdd(label: "New place") { creating = true }
        ) {
            Picker("Sort", selection: $sort) {
                ForEach(InventoryLocationSort.allCases) { Text($0.title).tag($0) }
            }
            Picker("Kind", selection: $kind) {
                Text("Every kind").tag(InventoryPlaceKind?.none)
                ForEach(InventoryPlaceKind.allCases) { option in
                    Label(option.title, systemImage: option.symbol)
                        .tag(InventoryPlaceKind?.some(option))
                }
            }
            .pickerStyle(.menu)
        }
    }

    private var filterSummary: String {
        [sort == .recorded ? nil : sort.title, kind?.title].compactMap(\.self)
            .joined(separator: ", ")
    }

    @ViewBuilder private var rootList: some View {
        if roots.isEmpty {
            InventoryLocationEmptyLine(text: "No \(kind?.title.lowercased() ?? "") places")
        } else {
            InventoryLocationPanel(rows: roots) { place in
                NavigationLink {
                    InventoryLocationPage(tree: tree, locationID: place.id)
                } label: {
                    InventoryLocationRowLabel(place: place, tree: tree)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var results: some View {
        let matches = tree.matching(query)
        if matches.isEmpty {
            InventoryLocationEmptyLine(text: "No places match \u{201C}\(query)\u{201D}")
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryLocationSectionHeader(
                    title: "Places", trailing: "\(matches.count)")
                InventoryLocationPanel(rows: matches) { place in
                    NavigationLink {
                        InventoryLocationPage(tree: tree, locationID: place.id)
                    } label: {
                        InventoryLocationRowLabel(place: place, tree: tree, showsPath: true)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var firstRun: some View {
        InventoryAddPlaceButton { creating = true }
            .inventoryFadeIn()
    }
}
