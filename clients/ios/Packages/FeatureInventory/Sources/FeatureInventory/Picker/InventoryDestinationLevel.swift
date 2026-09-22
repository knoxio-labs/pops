import DesignSystem
import SwiftUI

/// One level of the picker: the lists at the top, or a place's own children.
internal struct InventoryDestinationLevel: View {
    let tree: InventoryLocationTree
    let levelID: String?
    let offered: Set<String>?
    let effect: String?
    let isLoading: Bool
    let putBack: InventoryDestination?
    let recent: [InventoryDestination]
    let containers: [InventoryDestination]
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
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if let effect, !effect.isEmpty {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.move.system, tint: .popsInventory, text: effect)
                }
                if isLoading {
                    PopsListSkeleton(rows: 6)
                } else if let levelID {
                    placesSection(heading: nil, places: tree.children(of: levelID), at: levelID)
                } else {
                    searchBar
                    if query.isEmpty { topLevel } else { results }
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
            .popsMotion(value: query.isEmpty)
            .popsMotion(value: filter)
            .popsMotion(value: selection)
            .popsMotion(value: tree.nodes.count)
        }
        .background(Color.popsBackground)
    }

    private var searchBar: some View {
        InventorySearchBar(
            query: $query, prompt: "Search places", isFiltered: filter != .everywhere,
            filterSummary: filter == .everywhere ? "" : filter.title
        ) {
            Picker("Show", selection: $filter) {
                ForEach(InventoryDestinationFilter.allCases) { option in
                    Label(option.title, systemImage: option.symbol).tag(option)
                }
            }
        }
    }

    /// The open containers first, as the top level lists them, then every
    /// other container the places hold.
    private var everyContainer: [InventoryDestination] {
        let open = Set(containers.map(\.id))
        let placed = tree.ordered.flatMap { place in
            place.containers.map { InventoryDestination(container: $0, at: place) }
        }
        return containers + placed.filter { !open.contains($0.id) }
    }

    private var offeredContainers: [InventoryDestination] {
        switch filter {
        case .everywhere, .openContainers: containers
        case .containers: everyContainer
        case .places: []
        }
    }

    private func destination(for place: InventoryLocationNode) -> InventoryDestination {
        pending[place.id] ?? InventoryDestination(place: place, in: tree)
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
            openPanel
            placesSection(heading: "Places", places: tree.roots, at: nil)
        case .places:
            recentSection { !$0.isContainer }
            placesSection(heading: "Places", places: tree.roots, at: nil)
        case .containers:
            containerSection("Containers", everyContainer)
        case .openContainers:
            containerSection("Open containers", containers)
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

    @ViewBuilder private var openPanel: some View {
        if !containers.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                PopsSectionHeader(title: "Open containers")
                InventoryGroundedOpenPanel { divided(containers) }
            }
        }
    }

    @ViewBuilder
    private func containerSection(_ title: String, _ destinations: [InventoryDestination])
        -> some View
    {
        if destinations.isEmpty {
            PopsEmptyLine(text: "No \(title.lowercased())")
        } else {
            section(title) { rows(destinations) }
        }
    }

    @ViewBuilder private var results: some View {
        let places =
            filter.showsPlaces
            ? tree.matching(query).filter { isOffered($0.id) }
                .map(destination) : []
        let boxes = offeredContainers.filter { $0.name.localizedCaseInsensitiveContains(query) }
        if places.isEmpty, boxes.isEmpty {
            PopsEmptyLine(text: "No matches")
        } else {
            if !boxes.isEmpty {
                section(filter == .containers ? "Containers" : "Open containers") { rows(boxes) }
            }
            if !places.isEmpty { section("Places") { rows(places) } }
        }
    }

    private func placesSection(
        heading: String?, places: [InventoryLocationNode], at levelID: String?
    ) -> some View {
        let here = levelID.flatMap { tree.node($0) }.map { [$0] } ?? []
        let offeredPlaces = (here + places).filter { isOffered($0.id) }
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if let heading { PopsSectionHeader(title: heading) }
            InventoryGroundedListPanel {
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                    ForEach(offeredPlaces) { place in
                        row(
                            destination(for: place),
                            drillsInto: place.id == levelID ? nil : place,
                            reservesDrill: true)
                        PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                    InventoryNewPlaceRow(drafting: $drafting) { onCreate($0, levelID) }
                }
            }
        }
    }

    private func section(_ title: String, @ViewBuilder rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: title)
            InventoryGroundedListPanel { VStack(spacing: PopsSpacing.zero) { rows() } }
        }
    }

    private func rows(_ destinations: [InventoryDestination]) -> some View {
        divided(destinations)
    }

    private func divided(_ destinations: [InventoryDestination]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(destinations) { destination in
                row(destination)
                if destination.id != destinations.last?.id {
                    PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
    }

    private func row(
        _ destination: InventoryDestination, drillsInto place: InventoryLocationNode? = nil,
        reservesDrill: Bool = false
    ) -> some View {
        let canDrill = place.map { !tree.children(of: $0.id).isEmpty } ?? false
        return InventoryDestinationRow(
            destination: destination,
            isSelected: selection?.id == destination.id,
            drillID: canDrill ? place?.id : nil,
            reservesDrill: reservesDrill
        ) {
            selection = destination
        }
        .transition(PopsMotion.row)
    }
}
