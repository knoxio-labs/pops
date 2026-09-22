import DesignSystem
import SwiftUI

/// The lists on a place's page. Directly here and inside containers here are
/// two sections, never one: a thing in a box on the shelf is on the shelf
/// only through the box.
internal struct InventoryLocationSections: View {
    internal let tree: InventoryLocationTree
    internal let place: InventoryLocationNode
    @Bindable internal var model: InventoryLocationPageModel

    private var children: [InventoryLocationNode] { tree.children(of: place.id) }

    private var filledContainers: [InventoryPlacedContainer] {
        place.containers.filter { !$0.contents.isEmpty }
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if place.isEmpty, children.isEmpty {
                PopsEmptyLine(text: "Nothing here yet")
            }
            if !children.isEmpty { placesSection }
            if !place.isEmpty, !directRows.isEmpty { directSection }
            if !filledContainers.isEmpty { insideSection }
        }
    }

    private var placesSection: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: "Places", trailing: "\(children.count)")
            InventorySelectionPanel(rows: children) { child in
                NavigationLink(value: InventoryRoute.place(child.id)) {
                    InventoryLocationRowLabel(place: child, tree: tree)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var directRows: [InventoryLocationDirectRow] {
        InventoryLocationDirectRow.rows(of: place)
    }

    private var directSection: some View {
        let rows = directRows
        let containers = rows.filter(\.isContainer).count
        let tally = InventoryPlaceTally(containers: containers, items: rows.count - containers)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: "Directly here", trailing: tally.summary)
            InventorySelectionPanel(rows: rows) { row in
                Group {
                    switch row {
                    case .container(let container): containerRow(container)
                    case .item(let entry): entryRow(entry)
                    }
                }
                .inventorySelectable(row.id, in: $model.selection)
            }
        }
    }

    private var insideSection: some View {
        let count = filledContainers.reduce(0) { $0 + $1.contents.count }
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(
                title: "Inside containers here",
                trailing: InventoryPlaceTally(items: count).summary)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                ForEach(filledContainers) { container in
                    InventoryLocationContainedGroup(container: container) { entryRow($0) }
                }
            }
        }
    }

    private func containerRow(_ container: InventoryPlacedContainer) -> some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            InventoryGroundedRowLabel(
                title: container.name,
                detail: container.isOpen ? "Open container" : "Container",
                symbol: container.symbol,
                value: "\(container.contents.count)",
                tone: container.isOpen ? .popsWarning : .popsMutedForeground)
        }
        .buttonStyle(.plain)
    }

    private func entryRow(_ entry: InventoryPlacedEntry) -> some View {
        NavigationLink(value: InventoryRoute.item(entry.id)) {
            InventoryGroundedRowLabel(
                title: entry.name, detail: entry.typeName, symbol: entry.symbol,
                value: entry.quantity == 1 ? nil : "\(entry.quantity)")
        }
        .buttonStyle(.plain)
    }
}

/// A row in Directly here: a container or an item, containers first, each
/// keeping its own real id rather than a synthetic one, since a container
/// and an item never share the ids the store hands out.
internal enum InventoryLocationDirectRow: Identifiable {
    case container(InventoryPlacedContainer)
    case item(InventoryPlacedEntry)

    internal var id: String {
        switch self {
        case .container(let container): container.id
        case .item(let entry): entry.id
        }
    }

    internal var name: String {
        switch self {
        case .container(let container): container.name
        case .item(let entry): entry.name
        }
    }

    internal var isContainer: Bool {
        if case .container = self { true } else { false }
    }

    internal static func rows(of place: InventoryLocationNode) -> [InventoryLocationDirectRow] {
        place.containers.map(Self.container) + place.items.map(Self.item)
    }
}

/// One container's contents, headed by the container, so nothing in it reads
/// as sitting on the place itself.
private struct InventoryLocationContainedGroup<Row: View>: View {
    let container: InventoryPlacedContainer
    @ViewBuilder let row: (InventoryPlacedEntry) -> Row

    var body: some View {
        InventoryGroundedListPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                Label {
                    Text("In \(container.name)")
                        .font(.popsSubheadline.weight(.semibold))
                        .foregroundStyle(Color.popsForeground)
                } icon: {
                    Image(systemName: container.symbol)
                        .foregroundStyle(
                            container.isOpen ? Color.popsWarning : Color.popsMutedForeground)
                }
                .font(.popsSubheadline)
                .padding(.vertical, PopsSpacing.xs)
                ForEach(container.contents) { entry in
                    PopsDivider()
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    row(entry)
                }
            }
        }
    }
}
