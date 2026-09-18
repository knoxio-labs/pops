import AppCore
import Foundation

/// A place search found: its name and the places above it.
internal struct InventorySearchPlace: Identifiable, Equatable, Sendable {
    internal let id: InventoryLocation.ID
    internal let name: String
    /// The parent places, outermost first.
    internal let parents: [String]

    /// Every live place whose name contains `query`, in tree order: each
    /// root, then its descendants depth first, siblings by their sort order.
    /// An empty query matches nothing.
    internal static func matching(_ query: String, in tree: [InventoryLocation]) -> [Self] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let live = tree.filter { !$0.isDeleted }
        let children = Dictionary(grouping: live, by: \.parentId)
        var ordered: [Self] = []
        func visit(_ parentId: InventoryLocation.ID?, parents: [String]) {
            let siblings = (children[parentId] ?? []).sorted { $0.sortOrder < $1.sortOrder }
            for location in siblings {
                if location.name.localizedCaseInsensitiveContains(trimmed) {
                    ordered.append(Self(id: location.id, name: location.name, parents: parents))
                }
                visit(location.id, parents: parents + [location.name])
            }
        }
        visit(nil, parents: [])
        return ordered
    }
}

/// One row of the ranked result list: an item or container, or a place.
internal enum InventorySearchHit: Identifiable, Equatable, Sendable {
    case record(InventoryRecord)
    case place(InventorySearchPlace)

    internal var id: String {
        switch self {
        case .record(let record): "record-\(record.id)"
        case .place(let place): "place-\(place.id)"
        }
    }

    internal var name: String {
        switch self {
        case .record(let record): record.name
        case .place(let place): place.name
        }
    }

    internal var recordID: InventoryItem.ID? {
        guard case .record(let record) = self else { return nil }
        return record.id
    }
}

internal enum InventorySearchRanking {
    /// Items, containers and places in one list, best first: a name that
    /// starts with the query, then a name that contains it, then a match on
    /// any other field. Ties keep the order they arrived in, records before
    /// places, so the replica's own order survives within each tier.
    internal static func rank(
        _ query: String, records: [InventoryRecord], places: [InventorySearchPlace]
    ) -> [InventorySearchHit] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let hits = records.map(InventorySearchHit.record) + places.map(InventorySearchHit.place)
        return hits.enumerated()
            .sorted { lhs, rhs in
                let left = tier(lhs.element.name, trimmed)
                let right = tier(rhs.element.name, trimmed)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    /// Whether the query was found in the record's inventory code, which is
    /// when its row shows the code badge.
    internal static func matchedCode(_ query: String, in record: InventoryRecord) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let code = record.code else { return false }
        return code.localizedCaseInsensitiveContains(trimmed)
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
