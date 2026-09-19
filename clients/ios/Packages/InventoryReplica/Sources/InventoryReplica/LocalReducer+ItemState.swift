import AppCore
import Foundation
import GRDB

/// `access.ts`, `lifecycle.ts`, `item-quantity.ts`, `item-split.ts` and
/// `item-delete.ts`.
extension LocalReducer {
    func setItemAccess(id: String, access: InventoryAccess) throws -> Written {
        let before = try liveItem(id)
        guard var containment = before.containment else {
            throw refusal(.notContainer, "item \(id) is not a container")
        }
        containment.access = access.storageValue
        var after = before
        after.containment = containment
        let kind = access == .open ? "opened" : "closed"
        return try update(before, to: after, kind: kind) ?? unchanged(before)
    }

    func setItemFull(id: String, isFull: Bool) throws -> Written {
        let before = try liveItem(id)
        guard var containment = before.containment else {
            throw refusal(.notContainer, "item \(id) is not a container")
        }
        containment.isFull = isFull
        var after = before
        after.containment = containment
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    func setItemLifecycle(
        id: String, lifecycle: InventoryLifecycle, reason: InventoryDiscardReason?
    ) throws -> Written {
        if case .unrecognised(let value) = lifecycle {
            throw refusal(.invalid, "unknown lifecycle \(value)")
        }
        guard lifecycle != .active || reason == nil else {
            throw refusal(.invalid, "an active item has no lifecycle reason")
        }
        let before = try liveItem(id)
        if before.lifecycle == "destroyed", lifecycle != .destroyed {
            throw refusal(.illegalTransition, "a destroyed item cannot be restored")
        }
        var after = before
        after.lifecycle = lifecycle.storageValue
        return try update(before, to: after, kind: "lifecycle_changed") ?? unchanged(before)
    }

    func setItemQuantity(id: String, quantity: Int) throws -> Written {
        guard quantity >= 1 else { throw refusal(.invalid, "a quantity is at least 1") }
        let before = try liveItem(id)
        var after = before
        after.quantity = quantity
        return try update(before, to: after, kind: "quantity_changed") ?? unchanged(before)
    }

    /// The split-off item copies placement, type, fields, note, external ids
    /// and photos, and not the code, the lifecycle or the remembered previous
    /// placement: the server inserts it fresh with only those columns.
    func splitItem(id: String, newItemId: String, quantity: Int) throws -> Written {
        try requireUUID(newItemId, for: "item.split")
        guard quantity >= 1 else { throw refusal(.invalid, "a quantity is at least 1") }
        let before = try liveItem(id)
        guard try item(newItemId) == nil else {
            throw refusal(.invalid, "item \(newItemId) already exists")
        }
        let remaining = before.quantity - quantity
        guard remaining >= 1 else {
            throw refusal(.invalid, "a split must leave at least one item behind")
        }
        var after = before
        after.quantity = remaining
        let written = try update(before, to: after, kind: "split_from") ?? unchanged(before)
        var split = before
        split.id = newItemId
        split.seq = 0
        split.code = nil
        split.quantity = quantity
        split.lifecycle = "active"
        split.lifecycleChangedAt = nil
        split.previousPlacement = nil
        split.containment = before.containment.map {
            StoredContainment(access: $0.access, isFull: false)
        }
        split.provenance = nil
        split.documents = .none
        split.documentTitles = []
        split.createdAt = now
        split.updatedAt = now
        _ = try create(split, kind: "split_into")
        return written
    }

    func restoreDeletedItem(id: String) throws -> Written {
        guard let before = try item(id) else {
            throw refusal(.targetMissing, "item \(id) does not exist")
        }
        var after = before
        after.deletedAt = nil
        return try update(before, to: after, kind: "restored") ?? unchanged(before)
    }

    /// Tombstones the item, then empties it: each live item directly inside
    /// goes in hand remembering it, since deletion never cascades.
    func deleteItem(id: String) throws -> Written {
        let before = try liveItem(id)
        var after = before
        after.deletedAt = now
        let written = try update(before, to: after, kind: "deleted") ?? unchanged(before)
        let contents = try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM item WHERE containing_item_id = ? AND deleted_at IS NULL
                ORDER BY rowid
                """, arguments: [id]
        ).map { WorkingItem(try ItemRow.decode($0, in: nil)) }
        for child in contents {
            var moved = child
            moved.placement = .hand
            moved.previousPlacement = .container(id)
            _ = try update(child, to: moved, kind: "picked_up")
        }
        return written
    }
}
