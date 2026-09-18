import DesignSystem
import SwiftUI

/// The lists on a place's page. Directly here and inside containers here are
/// two sections, never one: a thing in a box on the shelf is on the shelf only
/// through the box (ADR-001).
internal struct InventoryLocationSections: View {
    internal let tree: InventoryLocationTree
    internal let place: InventoryLocationNode
    @Binding internal var selection: InventorySelection
    internal let removed: Set<String>

    private var children: [InventoryLocationNode] { tree.children(of: place.id) }

    private var filledContainers: [InventoryPlacedContainer] {
        place.containers.filter { !$0.contents.isEmpty }
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if place.isEmpty, children.isEmpty {
                InventoryLocationEmptyLine(text: "Nothing here yet")
            }
            if !children.isEmpty { placesSection }
            if !place.isEmpty, !directRows.isEmpty { directSection }
            if !filledContainers.isEmpty { insideSection }
        }
    }

    private var placesSection: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(title: "Places", trailing: "\(children.count)")
            InventoryLocationPanel(rows: children) { child in
                NavigationLink {
                    InventoryLocationPage(tree: tree, locationID: child.id)
                } label: {
                    InventoryLocationRowLabel(place: child, tree: tree)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var directSection: some View {
        let rows = directRows
        let containers = rows.filter(\.isContainer).count
        let tally = InventoryPlaceTally(containers: containers, items: rows.count - containers)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(title: "Directly here", trailing: tally.summary)
            InventoryLocationPanel(rows: rows) { row in
                Group {
                    switch row {
                    case .container(let container): containerRow(container)
                    case .item(let entry): entryRow(entry)
                    }
                }
                .inventorySelectable(row.id, in: $selection)
            }
        }
    }

    private var directRows: [InventoryLocationDirectRow] {
        InventoryLocationDirectRow.rows(of: place).filter { !removed.contains($0.id) }
    }

    private var insideSection: some View {
        let count = filledContainers.reduce(0) { $0 + $1.contents.count }
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(
                title: "Inside containers here",
                trailing: InventoryPlaceTally(items: count).summary)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                ForEach(filledContainers) { container in
                    InventoryLocationContainedGroup(container: container) { entryRow($0) }
                }
            }
        }
    }

    @ViewBuilder private func containerRow(_ container: InventoryPlacedContainer) -> some View {
        let label = InventoryGroundedRowLabel(
            title: container.name,
            detail: container.isOpen ? "Open container" : "Container",
            symbol: container.symbol,
            value: "\(container.contents.count)",
            tone: container.isOpen ? .popsWarning : .popsMutedForeground)
        if let profile = InventoryContainerFixtures.all.first(where: { $0.id == container.id }) {
            NavigationLink {
                InventoryContainerPage(profile: profile)
            } label: {
                label
            }
            .buttonStyle(.plain)
        } else {
            Button {
            } label: {
                label
            }
            .buttonStyle(.plain)
        }
    }

    private func entryRow(_ entry: InventoryPlacedEntry) -> some View {
        Button {
        } label: {
            InventoryGroundedRowLabel(
                title: entry.name, detail: entry.typeName, symbol: entry.symbol,
                value: entry.quantity == 1 ? nil : "\(entry.quantity)")
        }
        .buttonStyle(.plain)
    }
}

/// A row in Directly here: a container or an item, containers first.
internal enum InventoryLocationDirectRow: Identifiable {
    case container(InventoryPlacedContainer)
    case item(InventoryPlacedEntry)

    internal var id: String {
        switch self {
        case .container(let container): "container-\(container.id)"
        case .item(let entry): "item-\(entry.id)"
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

/// A place's page before its record arrives.
internal struct InventoryLocationPageSkeleton: View {
    @ScaledMetric(relativeTo: .largeTitle) private var titleLine = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    bar(width: 0.6, height: titleLine)
                    bar(width: 0.45, height: line)
                    bar(width: 0.3, height: line)
                }
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(0..<4, id: \.self) { _ in
                        Circle().fill(Color.popsSurface)
                            .frame(width: control, height: control)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
            InventoryLocationListSkeleton(rows: 5)
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.top, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .accessibilityLabel("Loading")
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * width)
        }
        .frame(height: height)
    }
}
