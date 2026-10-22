/// An item named by an assembly relation (Inventory ADR-001, "Assemblies and
/// parts"): enough to draw a row and open it.
public struct InventoryItemReference: Identifiable, Hashable, Sendable {
    public let id: InventoryItem.ID
    public let name: String
    public let code: String?

    public init(id: InventoryItem.ID, name: String, code: String?) {
        self.id = id
        self.name = name
        self.code = code
    }
}

/// Where a part sits right now, with the server's names for it. A part's
/// placement is its own: a couch module can be in storage while the couch is
/// in the lounge.
public enum InventoryPartPlacement: Hashable, Sendable {
    case location(id: InventoryLocation.ID, name: String?)
    case container(id: InventoryItem.ID, name: String?)
    case hand
}

/// One part of an assembly.
public struct InventoryPart: Identifiable, Hashable, Sendable {
    public let reference: InventoryItemReference
    public let typeId: String?
    public let lifecycle: InventoryLifecycle
    public let placement: InventoryPartPlacement

    public var id: InventoryItem.ID { reference.id }

    public init(
        reference: InventoryItemReference, typeId: String?, lifecycle: InventoryLifecycle,
        placement: InventoryPartPlacement
    ) {
        self.reference = reference
        self.typeId = typeId
        self.lifecycle = lifecycle
        self.placement = placement
    }
}

/// An item's place in the assembly tree: what it is a part of, and its own
/// parts. `canHaveParts` follows its type's `parts` capability; parts are
/// still listed when it is false, so a retyped assembly can be emptied.
public struct InventoryItemParts: Hashable, Sendable {
    public let canHaveParts: Bool
    public let assembly: InventoryItemReference?
    public let parts: [InventoryPart]

    public init(canHaveParts: Bool, assembly: InventoryItemReference?, parts: [InventoryPart]) {
        self.canHaveParts = canHaveParts
        self.assembly = assembly
        self.parts = parts
    }

    /// Nothing to show: the item is no assembly and part of none.
    public var isEmpty: Bool { !canHaveParts && assembly == nil && parts.isEmpty }
}

/// Why a parts call did not answer.
public enum InventoryPartsError: Error, Hashable, Sendable {
    /// The server refused the change and said why, in words fit to show: the
    /// type grants no parts, the item is already in another assembly, or it
    /// would become a part of itself.
    case refused(String)
    /// The server does not know the item, or the pair is not linked.
    case notFound
    /// No paired server could answer right now.
    case unavailable
}

/// Reads and edits assemblies online, through bfm's
/// `/mobile/inventory/items/:id/parts` relay. Parts are not in the sync
/// protocol, so this is a separate seam from ``InventoryStore``, the same way
/// ``InventoryCodeSuggestionService`` is.
public protocol InventoryPartsService: Sendable {
    /// - Throws: ``InventoryPartsError``, or a `RepositoryError` for a transport
    ///   or contract failure.
    func parts(of itemId: InventoryItem.ID) async throws -> InventoryItemParts

    /// Makes `partId` a part of `assemblyId` and answers the assembly's new view.
    func addPart(_ partId: InventoryItem.ID, to assemblyId: InventoryItem.ID) async throws
        -> InventoryItemParts

    /// Stops `partId` being a part of `assemblyId`; the item itself is kept.
    func removePart(_ partId: InventoryItem.ID, from assemblyId: InventoryItem.ID) async throws
        -> InventoryItemParts
}
