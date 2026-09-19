import Foundation

/// A place, in ADR-001's sense: a room or an area within one, not a
/// container. `parentId` is the only nesting a location has; a location's own
/// position among its siblings is `sortOrder`.
public struct InventoryLocation: Identifiable, Hashable, Sendable {
    public let id: String
    public let revision: Int
    public let seq: Int
    public let name: String
    public let parentId: InventoryLocation.ID?
    public let sortOrder: Int
    /// Set when this location was deleted. At the same moment its child
    /// places moved to its parent and its direct items went in hand,
    /// remembering it (D2), so a tombstoned location is never found holding
    /// anything by the time this is read.
    public let deletedAt: Date?

    public init(
        id: String,
        revision: Int,
        seq: Int,
        name: String,
        parentId: InventoryLocation.ID?,
        sortOrder: Int,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.revision = revision
        self.seq = seq
        self.name = name
        self.parentId = parentId
        self.sortOrder = sortOrder
        self.deletedAt = deletedAt
    }

    public var isDeleted: Bool { deletedAt != nil }
}
