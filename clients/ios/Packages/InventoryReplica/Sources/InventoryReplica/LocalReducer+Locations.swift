import AppCore
import GRDB

/// `location.ts`.
extension LocalReducer {
    /// The new place's sort position is 0 whatever the command says: that is
    /// what the server stores, because the mutation it is sent as carries no
    /// sort position.
    func createLocation(_ new: InventoryNewLocation) throws -> Written {
        try requireUUID(new.id, for: "location.create")
        let name = try requiredName(new.name)
        guard try location(new.id) == nil else {
            throw refusal(.invalid, "location \(new.id) already exists")
        }
        try assertParentAllowed(locationId: new.id, parentId: new.parentId)
        if let parentId = new.parentId { references.insert(.location(parentId)) }
        let row = WorkingLocation(
            id: new.id, revision: 1, seq: 0, name: name, parentId: new.parentId, sortOrder: 0,
            deletedAt: nil)
        return try create(row, kind: "created")
    }

    func renameLocation(id: String, name: String) throws -> Written {
        let trimmed = try requiredName(name)
        let before = try liveLocation(id)
        var after = before
        after.name = trimmed
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    func moveLocation(id: String, parentId: String?) throws -> Written {
        let before = try liveLocation(id)
        if let parentId { references.insert(.location(parentId)) }
        if parentId != before.parentId {
            try assertParentAllowed(locationId: id, parentId: parentId)
        }
        var after = before
        after.parentId = parentId
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    /// Tombstones the place. Its child places move up to its own parent; its
    /// direct items do not follow them, and go in hand remembering it
    /// instead (POPS-4053).
    func deleteLocation(id: String) throws -> Written {
        let before = try liveLocation(id)
        var after = before
        after.deletedAt = now
        let written = try update(before, to: after, kind: "deleted") ?? unchanged(before)
        let children = try Row.fetchAll(
            db,
            sql: "SELECT * FROM location WHERE parent_id = ? AND deleted_at IS NULL ORDER BY rowid",
            arguments: [id]
        ).map { WorkingLocation(try LocationRow.decode($0)) }
        for child in children {
            var moved = child
            moved.parentId = before.parentId
            _ = try update(child, to: moved, kind: "edited")
        }
        let items = try Row.fetchAll(
            db,
            sql: "SELECT * FROM item WHERE location_id = ? AND deleted_at IS NULL ORDER BY rowid",
            arguments: [id]
        ).map { WorkingItem(try ItemRow.decode($0, in: nil)) }
        for item in items {
            var moved = item
            moved.placement = .hand
            moved.previousPlacement = .location(id)
            _ = try update(item, to: moved, kind: "moved")
        }
        return written
    }
}
