import DesignSystem
import SwiftUI

/// A section header naming what is under it and how many.
internal struct InventorySearchGroupHeader: View {
    internal let group: InventorySearchGroup

    internal var body: some View {
        Text("\(group.title) · \(group.count)")
    }
}

/// One item or container, routed to its detail. The row is
/// ``InventoryItemRow`` itself, a search result is not a different shape,
/// it is the catalogue's own row plus why it matched.
internal struct InventorySearchResultRow: View {
    internal let match: InventorySearchMatch

    internal var body: some View {
        NavigationLink(value: route) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                InventoryItemRow(item: match.record.item)
                if let facet = matchedFacet {
                    Text("Matched by \(facet.label.lowercased())")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
    }

    private var route: InventoryRoute {
        match.record.kind == .container
            ? .container(match.record.id) : .item(match.record.id)
    }

    /// The name always matches on the query text itself, so it says nothing
    /// a reader could not already see; the first facet beyond it is the one
    /// worth calling out.
    private var matchedFacet: InventorySearchFacet? {
        match.facets.first { $0 != .name }
    }
}

/// A place, routed to the locations browser rather than to itself, there is
/// no location detail screen, ADR-001: a location is not an item.
internal struct InventorySearchLocationRow: View {
    internal let location: InventoryLocationRecord

    internal var body: some View {
        NavigationLink(value: InventoryRoute.locations) {
            InventoryLocationRow(
                name: location.name, parent: parentName, itemCount: location.itemCount,
                containerCount: location.containerCount)
        }
    }

    private var parentName: String? {
        guard let parentID = location.parentID else { return nil }
        return InventorySearchFixtures.locations.first { $0.id == parentID }?.name
    }
}
