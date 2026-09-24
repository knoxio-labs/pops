import AppCore
import Foundation
import GRDB

/// The checks the server's command layer makes before it writes, each
/// refusing with the same reason: `placement.ts`, `validation.ts` and the
/// zod argument schemas of each op.
extension LocalReducer {
    /// The most containers that may stand above one item, counting its own
    /// (`MAX_CONTAINMENT_DEPTH`).
    static let maximumContainmentDepth = 32

    func requireUUID(_ id: String, for op: String) throws {
        guard UUID(uuidString: id) != nil else {
            throw refusal(.invalid, "\(op) needs a UUID id")
        }
    }

    /// A name as zod's `trim().min(1)` leaves it: trimmed, and refused when
    /// nothing is left.
    func requiredName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw refusal(.invalid, "a name cannot be empty") }
        return trimmed
    }

    /// `externalIdsSchema`: every kind and value is non-empty, kept as sent.
    func storedExternalIds(_ ids: [InventoryExternalIdentifier]) throws
        -> [StoredExternalIdentifier]
    {
        guard ids.allSatisfy({ !$0.kind.isEmpty && !$0.value.isEmpty }) else {
            throw refusal(.invalid, "an external id has a kind and a value")
        }
        return ids.map(StoredExternalIdentifier.init)
    }

    /// Empty or whitespace-only becomes nil; anything else is kept exactly
    /// (`normalizeNote`).
    func normalizedNote(_ note: String?) -> String? {
        guard let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return note
    }

    /// The type `typeKey` names, nil for an untyped item, and `type_unknown`
    /// for a key the stored catalogue does not have.
    func resolveType(_ typeKey: String?) throws -> InventoryType? {
        guard let typeKey else { return nil }
        guard !typeKey.isEmpty else { throw refusal(.invalid, "a type key cannot be empty") }
        guard let type = catalogue?.type(forKey: typeKey) else {
            throw refusal(.typeUnknown, "unknown type \(typeKey)")
        }
        return type
    }

    /// `fields` validated against `type`, or required empty for an untyped
    /// item, which has no schema to check them against.
    func assertFieldsFit(_ fields: [String: InventoryFieldValue], type: InventoryType?) throws {
        guard let type else {
            if !fields.isEmpty { throw refusal(.invalid, "an untyped item cannot carry fields") }
            return
        }
        let units = catalogue?.units ?? []
        guard CatalogueFieldCheck.fits(fields, type: type, units: units) else {
            throw refusal(.invalid, "fields do not fit type \(type.key)")
        }
    }

    /// A container must have quantity exactly 1 (ADR-002 D3): a physical
    /// container is one thing, and a grouped item can never hold contents.
    func assertContainerQuantity(isContainer: Bool, quantity: Int) throws {
        guard isContainer, quantity > 1 else { return }
        throw refusal(
            .quantityContainerConflict, "a container must have quantity exactly 1 (ADR-002 D3)")
    }

    /// Refuses a placement the item cannot take: a missing or deleted place
    /// or container, an item that is not a container, a container whose own
    /// quantity is greater than 1 (`quantityContainerConflict`, ADR-002 D3),
    /// or a containment cycle or chain deeper than the cap. In hand is
    /// always allowed.
    func assertPlacementAllowed(itemId: String, to placement: InventoryPlacement) throws {
        switch placement {
        case .hand:
            return
        case .location(let locationId):
            _ = try liveLocation(locationId)
        case .container(let containerId):
            guard containerId != itemId else {
                throw refusal(.cycle, "an item cannot contain itself")
            }
            let container = try liveItem(containerId)
            guard container.isContainer else {
                throw refusal(.notContainer, "item \(containerId) is not a container")
            }
            guard container.quantity <= 1 else {
                throw refusal(
                    .quantityContainerConflict,
                    "item \(containerId) has quantity \(container.quantity); "
                        + "a grouped item cannot hold contents (ADR-002 D3)")
            }
            let chain = try containerChain(from: containerId)
            guard !chain.contains(itemId) else {
                throw refusal(.cycle, "item \(itemId) already holds \(containerId)")
            }
            guard chain.count <= Self.maximumContainmentDepth else {
                throw refusal(.cycle, "containers nest at most 32 deep")
            }
        }
    }

    /// Refuses a parent a location cannot take: missing, deleted, or the
    /// location itself or one of its descendants. A root is always allowed.
    func assertParentAllowed(locationId: String, parentId: String?) throws {
        guard let parentId else { return }
        _ = try liveLocation(parentId)
        guard try !locationAncestry(from: parentId).contains(locationId) else {
            throw refusal(.cycle, "location \(locationId) cannot sit inside itself")
        }
    }

    func noteReference(_ placement: InventoryPlacement) {
        switch placement {
        case .location(let id): references.insert(.location(id))
        case .container(let id): references.insert(.item(id))
        case .hand: break
        }
    }

    /// `containerId` and every container above it, nearest first, stopping
    /// one past the cap so a cycle already in the data cannot loop.
    private func containerChain(from containerId: String) throws -> [String] {
        var chain = [containerId]
        var current = containerId
        while chain.count <= Self.maximumContainmentDepth {
            let next = try String.fetchOne(
                db, sql: "SELECT containing_item_id FROM item WHERE id = ?", arguments: [current])
            guard let next else { break }
            chain.append(next)
            current = next
        }
        return chain
    }

    /// `locationId` and every place above it, ending on a cycle already in
    /// the data.
    private func locationAncestry(from locationId: String) throws -> [String] {
        var ancestry = [locationId]
        var current = locationId
        while let parent = try String.fetchOne(
            db, sql: "SELECT parent_id FROM location WHERE id = ?", arguments: [current]),
            !ancestry.contains(parent)
        {
            ancestry.append(parent)
            current = parent
        }
        return ancestry
    }
}
