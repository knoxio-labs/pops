import Foundation

/// One row of the ranked result list: an item or container, or a place.
internal enum InventorySearchHit: Identifiable, Equatable {
    case record(InventorySearchMatch)
    case place(InventoryLocationNode)

    internal var id: String {
        switch self {
        case .record(let match): "record-\(match.id)"
        case .place(let place): "place-\(place.id)"
        }
    }

    internal var name: String {
        switch self {
        case .record(let match): match.record.item.name
        case .place(let place): place.name
        }
    }

    /// Whether the query was found in the inventory code, which is when the
    /// row shows its code badge.
    internal var matchedCode: Bool {
        guard case .record(let match) = self else { return false }
        return match.facets.contains(.inventoryCode)
    }
}

internal enum InventorySearchRanking {
    /// Items, containers and places in one list, best first: a name that
    /// starts with the query, then a name that contains it, then a match on
    /// any other field. Ties keep the order they arrived in, records before
    /// places.
    internal static func rank(
        _ query: String, matches: [InventorySearchMatch], places: [InventoryLocationNode]
    ) -> [InventorySearchHit] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let hits = matches.map(InventorySearchHit.record) + places.map(InventorySearchHit.place)
        return hits.enumerated()
            .sorted { lhs, rhs in
                let left = tier(lhs.element.name, trimmed)
                let right = tier(rhs.element.name, trimmed)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    private static func tier(_ name: String, _ query: String) -> Int {
        guard !query.isEmpty else { return 2 }
        if name.range(of: query, options: [.caseInsensitive, .anchored]) != nil { return 0 }
        return name.localizedCaseInsensitiveContains(query) ? 1 : 2
    }

    /// Every place in `text` where `query` appears, case-insensitively, for
    /// the amber highlight. Empty for an empty query.
    internal static func highlights(of query: String, in text: String) -> [Range<String.Index>] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        var ranges: [Range<String.Index>] = []
        var start = text.startIndex
        while let found = text.range(
            of: trimmed, options: .caseInsensitive, range: start..<text.endIndex)
        {
            ranges.append(found)
            start = found.upperBound
        }
        return ranges
    }
}
