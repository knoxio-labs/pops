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

    func createProtocol2Item(_ new: InventoryNewProtocol2Item) throws -> Written {
        try requireUUID(new.id, for: "item.create")
        let name = try requiredName(new.name)
        guard new.quantity >= 1 else { throw refusal(.invalid, "a quantity is at least 1") }
        guard try item(new.id) == nil else {
            throw refusal(.invalid, "item \(new.id) already exists")
        }
        let type = try protocol2Type(id: new.typeId, revision: new.catalogueRevision)
        let values = try protocol2Entries(new.values, type: type, revision: new.catalogueRevision)
        try assertPlacementAllowed(itemId: new.id, to: new.placement)
        noteReference(new.placement)
        let isContainer = type.capabilities.contains("containment")
        let row = WorkingItem(
            id: new.id, revision: 1, seq: 0, catalogueRevision: new.catalogueRevision,
            name: name, typeId: new.typeId, typeKey: nil, fieldValues: values, legacyType: nil,
            fields: [:], note: normalizedNote(new.note),
            code: nil, externalIds: try storedExternalIds(new.externalIds), quantity: new.quantity,
            lifecycle: "active", lifecycleChangedAt: nil,
            placement: StoredPlacement(new.placement), previousPlacement: nil,
            containment: isContainer ? StoredContainment(access: "open", isFull: false) : nil,
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
        var after = before
        after.typeKey = typeKey
        after.fields = fields.mapValues(StoredFieldValue.init)
        after.containment =
            type.isContainer
            ? before.containment ?? StoredContainment(access: "open", isFull: false) : nil
        return try update(before, to: after, kind: "type_changed") ?? unchanged(before)
    }

    func editProtocol2Item(
        id: String, catalogueRevision: Int, values: [InventoryProtocol2FieldPatch]
    ) throws -> Written {
        let before = try liveItem(id)
        guard before.catalogueRevision == catalogueRevision, let typeId = before.typeId else {
            throw refusal(.invalid, "item \(id) does not use catalogue revision \(catalogueRevision)")
        }
        let type = try protocol2Type(id: typeId, revision: catalogueRevision)
        var entries = Dictionary(uniqueKeysWithValues: before.fieldValues.map { ($0.fieldId, $0) })
        for patch in values {
            if let replacement = patch.values {
                entries[patch.fieldId] = .init(
                    fieldId: patch.fieldId, state: .value(replacement), source: .stored,
                    catalogueRevision: catalogueRevision)
            } else {
                entries.removeValue(forKey: patch.fieldId)
            }
        }
        let replacement = entries.values.sorted { $0.fieldId < $1.fieldId }
        try validateProtocol2Entries(replacement, type: type, revision: catalogueRevision)
        var after = before
        after.fieldValues = replacement
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    func changeProtocol2ItemType(
        id: String, catalogueRevision: Int, typeId: String,
        values: [InventoryProtocol2FieldValue]
    ) throws -> Written {
        let before = try liveItem(id)
        let type = try protocol2Type(id: typeId, revision: catalogueRevision)
        let entries = try protocol2Entries(values, type: type, revision: catalogueRevision)
        let hasContents = try hasActiveContents(id)
        if before.isContainer && !type.capabilities.contains("containment") && hasContents {
            throw refusal(.hasContents, "item \(id) still holds active contents")
        }
        var after = before
        after.catalogueRevision = catalogueRevision
        after.typeId = typeId
        after.typeKey = nil
        after.fieldValues = entries
        after.containment = type.capabilities.contains("containment")
            ? before.containment ?? StoredContainment(access: "open", isFull: false) : nil
        return try update(before, to: after, kind: "type_changed") ?? unchanged(before)
    }

    private func protocol2Type(id: String, revision: Int) throws -> InventoryCatalogueType {
        guard try SyncMeta.read(db).catalogueRevision == revision,
            let catalogue = try Protocol2CatalogueRows.read(revision: revision, in: db),
            let type = catalogue.types.first(where: { $0.id == id })
        else { throw refusal(.typeUnknown, "unknown active type \(id)") }
        return type
    }

    private func protocol2Entries(
        _ values: [InventoryProtocol2FieldValue], type: InventoryCatalogueType, revision: Int
    ) throws -> [InventoryItemFieldEntry] {
        let entries = values.map {
            InventoryItemFieldEntry(
                fieldId: $0.fieldId, state: .value($0.values), source: .stored,
                catalogueRevision: revision)
        }
        try validateProtocol2Entries(entries, type: type, revision: revision)
        return entries
    }

    private func validateProtocol2Entries(
        _ entries: [InventoryItemFieldEntry], type: InventoryCatalogueType, revision: Int
    ) throws {
        guard Set(entries.map(\.fieldId)).count == entries.count else {
            throw refusal(.invalid, "a stable field is present more than once")
        }
        let fields = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.id, $0) })
        for entry in entries {
            guard let field = fields[entry.fieldId], field.storage == .stored,
                entry.catalogueRevision == revision, case .value(let values) = entry.state,
                !values.isEmpty
            else { throw refusal(.invalid, "invalid stable field \(entry.fieldId)") }
            guard field.cardinality == .many || values.count == 1,
                values.allSatisfy({ primitiveKind(of: $0, matches: field.kind) })
            else { throw refusal(.invalid, "invalid values for stable field \(entry.fieldId)") }
        }
        for field in type.fields where field.storage == .stored && field.required {
            guard entries.contains(where: { $0.fieldId == field.id }) else {
                throw refusal(.invalid, "required stable field \(field.id) is missing")
            }
        }
    }

    private func primitiveKind(of value: InventoryPrimitiveValue, matches field: InventoryPrimitiveKind)
        -> Bool
    {
        switch value {
        case .string: field == .shortText || field == .longText
        case .integer: field == .integer
        case .decimal: field == .decimal
        case .boolean: field == .boolean
        case .enumeration: field == .enumeration
        case .measurement: field == .measurement
        case .date: field == .date
        case .dateTime: field == .dateTime
        case .url: field == .url
        case .reference: field == .reference
        }
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

    private func hasActiveContents(_ id: String) throws -> Bool {
        try Bool.fetchOne(
            db,
            sql: """
                SELECT EXISTS (SELECT 1 FROM item WHERE containing_item_id = ?
                    AND deleted_at IS NULL AND lifecycle = 'active')
                """, arguments: [id]) ?? false
    }
}
