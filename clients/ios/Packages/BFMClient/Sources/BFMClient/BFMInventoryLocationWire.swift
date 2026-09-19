import AppCore
import Foundation

/// One location row: identical fields on every operation that carries one,
/// so unlike ``WireInventoryItem`` this needs no associated type.
internal protocol WireInventoryLocation {
    var id: String { get }
    var revision: Int { get }
    var seq: Int { get }
    var name: String { get }
    var parentId: String? { get }
    var sortOrder: Int { get }
    var deletedAt: String? { get }
}

extension WireInventoryLocation {
    /// Maps this row into ``InventoryLocation``.
    ///
    /// - Throws: ``RepositoryError/contractMismatch`` for a `deletedAt` this
    ///   build cannot parse as an instant.
    internal func inventoryLocation() throws -> InventoryLocation {
        let deletedAt: Date?
        if let raw = self.deletedAt {
            guard let parsed = ISO8601Instant.parse(raw) else {
                throw RepositoryError.contractMismatch
            }
            deletedAt = parsed
        } else {
            deletedAt = nil
        }
        return InventoryLocation(
            id: id, revision: revision, seq: seq, name: name, parentId: parentId,
            sortOrder: sortOrder, deletedAt: deletedAt
        )
    }
}

extension Operations.MobileInventory_snapshot.Output.Ok.Body.JsonPayload.LocationsPayloadPayload:
    WireInventoryLocation
{}
extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.LocationsPayloadPayload:
    WireInventoryLocation
{}
