/// The matching rule search uses, pure so it can be tested without a view.
///
/// A record matches when the query is found in any of the facets ADR-001
/// names as findable, name, inventory code, external identifier, note,
/// type, capability or placement, and the match says which facets it was,
/// so a row can tell the reader why it is here.
internal struct InventorySearchMatch: Identifiable, Equatable {
    internal let record: InventorySearchRecord
    internal let facets: [InventorySearchFacet]

    internal var id: String { record.id }
}

internal enum InventorySearchEngine {
    /// Every record whose findable text contains `query`, case-insensitively.
    /// An empty or whitespace-only query matches nothing, the caller decides
    /// what an empty query shows, and it is never "everything".
    internal static func search(
        _ query: String, in records: [InventorySearchRecord]
    ) -> [InventorySearchMatch] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        return records.compactMap { record in
            let facets = matchingFacets(trimmed, record: record)
            return facets.isEmpty ? nil : InventorySearchMatch(record: record, facets: facets)
        }
    }

    private static func matchingFacets(
        _ query: String, record: InventorySearchRecord
    ) -> [InventorySearchFacet] {
        InventorySearchFacet.allCases.filter { facet in
            text(for: facet, record: record)?.localizedCaseInsensitiveContains(query) ?? false
        }
    }

    private static func text(for facet: InventorySearchFacet, record: InventorySearchRecord)
        -> String?
    {
        let item = record.item
        switch facet {
        case .name: return item.name
        case .inventoryCode: return item.code
        case .externalIdentifier: return record.externalIdentifier
        case .note: return record.note
        case .typeName: return item.typeName
        case .capability:
            return record.capabilities.isEmpty ? nil : record.capabilities.joined(separator: " ")
        case .placement: return placementText(item)
        }
    }

    private static func placementText(_ item: InventoryFoundationItem) -> String {
        (item.placement.crumbs + [item.placement.effectiveLocation].compactMap { $0 })
            .joined(separator: " ")
    }
}
