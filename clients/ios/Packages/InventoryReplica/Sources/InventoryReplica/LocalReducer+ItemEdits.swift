import AppCore
import Foundation
import GRDB

/// `item-create.ts`, `item-edit.ts`, `item-type.ts`, `item-code.ts` and
/// `placement.ts`'s `item.move`.
extension LocalReducer {
    func createItem(_ new: InventoryNewItem) throws -> Written {
        try requireUUID(new.id, for: "item.create")
        let name = try requiredName(new.name)
        guard new.quantity >= 1 else { throw refusal(.invalid, "a quantity is at least 1") }
        guard try item(new.id) == nil else {
            throw refusal(.invalid, "item \(new.id) already exists")
        }
        let type = try resolveType(new.typeKey)
        try assertFieldsFit(new.fields, type: type)
        let externalIds = try storedExternalIds(new.externalIds)
        try assertPlacementAllowed(itemId: new.id, to: new.placement)
        try assertContainerQuantity(isContainer: type?.isContainer == true, quantity: new.quantity)
        noteReference(new.placement)
        let row = WorkingItem(
            id: new.id, revision: 1, seq: 0, catalogueRevision: nil, name: name, typeId: nil,
            typeKey: new.typeKey, fieldValues: [], legacyType: nil,
            fields: new.fields.mapValues(StoredFieldValue.init), note: normalizedNote(new.note),
            code: nil, externalIds: externalIds, quantity: new.quantity, lifecycle: "active",
            lifecycleChangedAt: nil, placement: StoredPlacement(new.placement),
            previousPlacement: nil,
            containment: type?.isContainer == true
                ? StoredContainment(access: "open", isFull: false) : nil,
            photos: [], provenance: nil, documents: .none, documentTitles: [], createdAt: now,
            updatedAt: now, deletedAt: nil)
        return try create(row, kind: "created")
    }

    func editItem(
        id: String, name: String?, note: InventoryFieldUpdate<String>,
        fields patch: [String: InventoryFieldValue?], externalIds: [InventoryExternalIdentifier]?
    ) throws -> Written {
        let before = try liveItem(id)
        var after = before
        if let name { after.name = try requiredName(name) }
        if let externalIds { after.externalIds = try storedExternalIds(externalIds) }
        switch note {
        case .unchanged: break
        case .set(let text): after.note = normalizedNote(text)
        case .cleared: after.note = nil
        }
        if !patch.isEmpty {
            var merged = before.fields.mapValues(\.domainValue)
            for (key, value) in patch { merged[key] = value }
            let type = before.typeKey.flatMap { catalogue?.type(forKey: $0) }
            try assertFieldsFit(merged, type: type)
            after.fields = merged.mapValues(StoredFieldValue.init)
        }
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    func changeItemType(id: String, typeKey: String, fields: [String: InventoryFieldValue])
        throws -> Written
    {
        let before = try liveItem(id)
        guard let type = try resolveType(typeKey) else {
            throw refusal(.typeUnknown, "unknown type \(typeKey)")
        }
        try assertFieldsFit(fields, type: type)
        if before.isContainer, !type.isContainer, try hasActiveContents(id) {
            throw refusal(.hasContents, "item \(id) still holds active contents")
        }
        try assertContainerQuantity(isContainer: type.isContainer, quantity: before.quantity)
        var after = before
        after.typeKey = typeKey
        after.fields = fields.mapValues(StoredFieldValue.init)
        after.containment =
            type.isContainer
            ? before.containment ?? StoredContainment(access: "open", isFull: false) : nil
        return try update(before, to: after, kind: "type_changed") ?? unchanged(before)
    }

    func setItemCode(id: String, code: String?) throws -> Written {
        let before = try liveItem(id)
        var after = before
        if let code {
            let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, trimmed.utf16.count <= 64 else {
                throw refusal(.invalid, "a code is 1 to 64 characters")
            }
            if let holder = try codeHolder(trimmed, excluding: id) {
                throw InventoryCommandError.codeCollision(
                    heldById: holder.id, heldByName: holder.name,
                    suggestedCode: try suggestedCode(after: trimmed, excluding: id) ?? "")
            }
            after.code = trimmed
        } else {
            after.code = nil
        }
        return try update(before, to: after, kind: "code_set") ?? unchanged(before)
    }

    func moveItem(id: String, to placement: InventoryPlacement, verb: InventoryMoveVerb) throws
        -> Written
    {
        guard (verb == .pickUp) == (placement == .hand) else {
            throw refusal(.invalid, "pick_up moves into the hand, and only pick_up does")
        }
        let before = try liveItem(id)
        let target = StoredPlacement(placement)
        noteReference(placement)
        if target != before.placement {
            try assertPlacementAllowed(itemId: id, to: placement)
        }
        var after = before
        after.placement = target
        after.previousPlacement = Self.previousPlacement(of: before, after: target)
        return try update(before, to: after, kind: Self.moveEventKind(verb)) ?? unchanged(before)
    }

    /// Taking an item in hand remembers where it was, unless it was already
    /// in hand and keeps what it remembered; putting it anywhere else
    /// forgets (`previousPlacementAfter`).
    static func previousPlacement(of item: WorkingItem, after target: StoredPlacement)
        -> StoredPreviousPlacement?
    {
        guard target == .hand else { return nil }
        switch item.placement {
        case .hand: return item.previousPlacement
        case .location(let id): return .location(id)
        case .container(let id): return .container(id)
        }
    }

    private static func moveEventKind(_ verb: InventoryMoveVerb) -> String {
        switch verb {
        case .move: "moved"
        case .pickUp: "picked_up"
        case .putBack: "put_back"
        case .store: "stored"
        }
    }

    func hasActiveContents(_ id: String) throws -> Bool {
        try Bool.fetchOne(
            db,
            sql: """
                SELECT EXISTS (SELECT 1 FROM item WHERE containing_item_id = ?
                    AND deleted_at IS NULL AND lifecycle = 'active')
                """, arguments: [id]) ?? false
    }
}
