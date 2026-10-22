import AppCore

/// An `InventoryPartsService` that keeps assemblies in memory and refuses
/// what the server refuses: parts on an item whose type grants none, a part
/// already in another assembly, and an item that would become its own part.
public actor InMemoryInventoryPartsService: InventoryPartsService {
    private var items: [InventoryItem.ID: InventoryItemReference]
    private let assemblies: Set<InventoryItem.ID>
    private var links: [InventoryItem.ID: InventoryItem.ID]
    private let placements: [InventoryItem.ID: InventoryPartPlacement]
    /// Every add and remove, in order, as `(part, assembly)`.
    public private(set) var writes: [(part: InventoryItem.ID, assembly: InventoryItem.ID)] = []

    /// - Parameters:
    ///   - items: Every item the server knows.
    ///   - assemblies: The items whose type grants the `parts` capability.
    ///   - links: Existing parts, as part id to assembly id.
    ///   - placements: Where each part is; `.hand` when absent.
    public init(
        items: [InventoryItemReference] = [], assemblies: Set<InventoryItem.ID> = [],
        links: [InventoryItem.ID: InventoryItem.ID] = [:],
        placements: [InventoryItem.ID: InventoryPartPlacement] = [:]
    ) {
        self.items = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        self.assemblies = assemblies
        self.links = links
        self.placements = placements
    }

    public func parts(of itemId: InventoryItem.ID) async throws -> InventoryItemParts {
        try view(of: itemId)
    }

    public func addPart(_ partId: InventoryItem.ID, to assemblyId: InventoryItem.ID) async throws
        -> InventoryItemParts
    {
        guard let assembly = items[assemblyId], items[partId] != nil else {
            throw InventoryPartsError.notFound
        }
        guard assemblies.contains(assemblyId) else {
            throw InventoryPartsError.refused("\(assembly.name) cannot have parts")
        }
        if let current = links[partId], current != assemblyId {
            throw InventoryPartsError.refused("Already a part of \(items[current]?.name ?? current)")
        }
        guard !isAncestor(partId, of: assemblyId) else {
            throw InventoryPartsError.refused("An item cannot be a part of itself")
        }
        links[partId] = assemblyId
        writes.append((partId, assemblyId))
        return try view(of: assemblyId)
    }

    public func removePart(_ partId: InventoryItem.ID, from assemblyId: InventoryItem.ID)
        async throws -> InventoryItemParts
    {
        guard links[partId] == assemblyId else { throw InventoryPartsError.notFound }
        links[partId] = nil
        writes.append((partId, assemblyId))
        return try view(of: assemblyId)
    }

    private func isAncestor(_ candidate: InventoryItem.ID, of itemId: InventoryItem.ID) -> Bool {
        var current: InventoryItem.ID? = itemId
        var seen: Set<InventoryItem.ID> = []
        while let id = current, seen.insert(id).inserted {
            if id == candidate { return true }
            current = links[id]
        }
        return false
    }

    private func view(of itemId: InventoryItem.ID) throws -> InventoryItemParts {
        guard items[itemId] != nil else { throw InventoryPartsError.notFound }
        let parts = links.filter { $0.value == itemId }.keys
            .compactMap { items[$0] }
            .sorted { $0.name < $1.name }
            .map {
                InventoryPart(
                    reference: $0, typeId: nil, lifecycle: .active,
                    placement: placements[$0.id] ?? .hand)
            }
        return InventoryItemParts(
            canHaveParts: assemblies.contains(itemId),
            assembly: links[itemId].flatMap { items[$0] }, parts: parts)
    }
}
