import DesignSystem
import SwiftUI

/// One level of the picker: the quick choices at the top, or one level of
/// the shared destination tree.
internal struct InventoryDestinationLevel: View {
    let tree: InventoryDestinationTree
    let levelID: String?
    let offered: Set<String>?
    let effect: String?
    let isLoading: Bool
    let putBack: InventoryDestination?
    let recent: [InventoryDestination]
    /// Places named in New place and not created yet, by the id the tree
    /// gave them, so choosing one creates it rather than naming an id the
    /// store has never seen.
    let pending: [String: InventoryDestination]
    @Binding var query: String
    @Binding var filter: InventoryDestinationFilter
    @Binding var selection: InventoryDestination?
    @Binding var drafting: String?
    let onCreate: (String, String?) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if let effect, !effect.isEmpty {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.move.system, tint: .popsInventory, text: effect)
                }
                if isLoading {
                    InventoryRowsSkeleton(rows: 6, showsTrailingValue: false)
                        .transition(.opacity)
                } else if let levelID {
                    destinationSection(
                        heading: nil, nodes: levelNodes(at: levelID), parentID: levelID,
                        includesNewPlace: tree.node(levelID)?.isLocation == true
                    )
                    .transition(.opacity)
                } else {
                    Group {
                        searchBar
                        if query.isEmpty { topLevel } else { results }
                    }
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
            .popsMotion(value: query.isEmpty)
            .popsMotion(value: filter)
            .popsMotion(value: selection)
            .popsMotion(value: isLoading)
            .popsMotion(value: tree.nodes.count)
        }
        .background(Color.popsBackground)
    }

    private var searchBar: some View {
        PopsSearchBar(
            query: $query, tint: .popsInventory, prompt: "Search places and containers",
            isFiltered: filter != .everywhere,
            filterSummary: filter == .everywhere ? "" : filter.title,
            filterOptions: {
                Picker("Show", selection: $filter) {
                    ForEach(InventoryDestinationFilter.allCases) { option in
                        Label(option.title, systemImage: option.symbol).tag(option)
                    }
                }
            }
        )
    }

    private func destination(for node: InventoryDestinationTree.Node) -> InventoryDestination {
        pending[node.id] ?? node.destination
    }

    private func isOffered(_ id: String) -> Bool {
        offered?.contains(id) ?? true
    }

    @ViewBuilder private var topLevel: some View {
        switch filter {
        case .everywhere:
            if let putBack {
                section("Put back") { row(putBack) }
            }
            recentSection { _ in true }
            destinationSection(
                heading: "Destinations", nodes: tree.roots, parentID: nil,
                includesNewPlace: true)
        case .places:
            recentSection { !$0.isContainer }
            destinationSection(
                heading: "Places", nodes: tree.roots.filter(\.isLocation), parentID: nil,
                includesNewPlace: true)
        case .containers:
            destinationSection(
                heading: "Containers", nodes: tree.nodes.filter { !$0.isLocation }, parentID: nil,
                includesNewPlace: false)
        case .openContainers:
            destinationSection(
                heading: "Open containers",
                nodes: tree.nodes.filter { $0.destination.kind == .container },
                parentID: nil, includesNewPlace: false)
        }
    }

    @ViewBuilder
    private func recentSection(including: (InventoryDestination) -> Bool) -> some View {
        let recentPlaces = recent.filter {
            including($0) && ($0.kind != .location || isOffered($0.id))
        }
        if !recentPlaces.isEmpty {
            section("Recent") { rows(recentPlaces) }
        }
    }

    @ViewBuilder private var results: some View {
        let destinations = tree.matching(query)
            .filter { matchesFilter($0) && isOffered($0.id) }
            .map(destination)
        if destinations.isEmpty {
            PopsEmptyLine(text: "No matches")
        } else {
            section("Destinations") { rows(destinations) }
        }
    }

    private func levelNodes(at id: String) -> [InventoryDestinationTree.Node] {
        let current = tree.node(id).map { [$0] } ?? []
        return current + tree.children(of: id)
    }

    private func matchesFilter(_ node: InventoryDestinationTree.Node) -> Bool {
        switch filter {
        case .everywhere:
            true
        case .places:
            node.isLocation
        case .containers:
            !node.isLocation
        case .openContainers:
            node.destination.kind == .container
        }
    }

    @ViewBuilder
    private func destinationSection(
        heading: String?, nodes: [InventoryDestinationTree.Node], parentID: String?,
        includesNewPlace: Bool
    ) -> some View {
        let offeredNodes = nodes.filter { isOffered($0.id) }
        if offeredNodes.isEmpty, !includesNewPlace {
            PopsEmptyLine(text: "No \(heading?.lowercased() ?? "destinations")")
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                if let heading { PopsSectionHeader(title: heading) }
                InventoryGroundedListPanel {
                    LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                        ForEach(offeredNodes) { node in
                            row(node)
                            if node.id != offeredNodes.last?.id {
                                PopsDivider().padding(
                                    .leading, PopsSize.touchTarget + PopsSpacing.md)
                            }
                        }
                        if includesNewPlace {
                            if !offeredNodes.isEmpty {
                                PopsDivider().padding(
                                    .leading, PopsSize.touchTarget + PopsSpacing.md)
                            }
                            InventoryNewPlaceRow(drafting: $drafting) { onCreate($0, parentID) }
                        }
                    }
                }
            }
        }
    }

    private func section(_ title: String, @ViewBuilder rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: title)
            InventoryGroundedListPanel { LazyVStack(spacing: PopsSpacing.zero) { rows() } }
        }
    }

    private func rows(_ destinations: [InventoryDestination]) -> some View {
        divided(destinations)
    }

    private func divided(_ destinations: [InventoryDestination]) -> some View {
        LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(destinations) { destination in
                row(destination)
                if destination.id != destinations.last?.id {
                    PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
    }

    private func row(_ node: InventoryDestinationTree.Node) -> some View {
        let drillID = tree.drillID(for: node.id, at: levelID)
        return row(destination(for: node), drillID: drillID, reservesDrill: true)
    }

    private func row(
        _ destination: InventoryDestination, drillID: String? = nil, reservesDrill: Bool = false
    ) -> some View {
        InventoryDestinationRow(
            destination: destination,
            isSelected: selection?.id == destination.id,
            drillID: drillID,
            reservesDrill: reservesDrill
        ) {
            selection = destination
        }
        .transition(PopsMotion.row)
    }
}
