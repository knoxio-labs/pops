/// What a scan resolved to inside Inventory.
internal enum InventoryScanTarget: Equatable {
    case record(InventorySearchRecord)
    case place(InventoryLocationNode)
}

/// Where the scanner is: looking, resolving, or holding an answer.
internal enum InventoryScanPhase: Equatable {
    case scanning
    case loading
    case found(InventoryScanTarget)
    /// A well-formed POPS code another pillar opens. Shared POPS routing,
    /// so this is a hand-off, not a failure.
    case unsupported(pillar: String)
    case notPops
    case targetMissing
    case denied
}

internal enum InventoryScanRouting {
    /// Resolves a scanned string: parsed as a POPS URI, then looked up in
    /// `records` and `places`. A well-formed Inventory code with nothing
    /// behind it is ``InventoryScanPhase/targetMissing``.
    internal static func phase(
        for raw: String,
        records: [InventorySearchRecord] = InventorySearchFixtures.records,
        places: InventoryLocationTree = InventorySearchFixtures.places
    ) -> InventoryScanPhase {
        switch InventoryDeepLinkParser.parse(raw) {
        case .item(let id):
            return record(id, kind: .item, in: records)
        case .container(let id):
            return record(id, kind: .container, in: records)
        case .location(let id):
            return places.node(id).map { .found(.place($0)) } ?? .targetMissing
        case .otherPillar(let name):
            return .unsupported(pillar: name.capitalized)
        case .malformed:
            return .notPops
        }
    }

    private static func record(
        _ id: String, kind: InventorySearchKind, in records: [InventorySearchRecord]
    ) -> InventoryScanPhase {
        guard let found = records.first(where: { $0.id == id && $0.kind == kind }) else {
            return .targetMissing
        }
        return .found(.record(found))
    }
}
