import AppCore

/// Moves a queued change's values off definitions the server named as
/// replaced and onto their replacements, when the replacement accepts them.
///
/// "Accepts" is the rule the server's own compatibility check applies to a
/// field that keeps its identity across revisions (`sameFieldShape` in the
/// inventory pillar's `catalogue/compatibility-fields.ts`): the same
/// kind, cardinality, storage, fixed unit and reference constraint. A value
/// is never converted: a replacement in another unit, or of another kind,
/// refuses, and the change goes to repair with the value struck through.
///
/// A replaced type accepts a new item or a type change only when it is live
/// and declares every field the change carries values for: as a stored
/// field for a stored value, as a computed field that allows overrides for
/// a new item's override. An edit keeps the item's own type, so a replaced
/// type always refuses one.
internal struct CatalogueReplacement {
    let authored: InventoryCatalogueSnapshot?
    let target: InventoryCatalogueSnapshot

    struct Moved {
        let command: InventoryCommand
        /// The replacements named that did not accept the change.
        let refused: [InventoryCatalogueChange]
    }

    func move(
        _ command: InventoryCommand, along changes: [InventoryCatalogueChange],
        itemTypeId: String?
    ) -> Moved {
        let replacements = changes.filter(\.isReplacement)
        let ownType = command.protocol2TypeId ?? itemTypeId
        let typeChange = replacements.first { $0.definition == .type && $0.id == ownType }
        let landingType =
            command.protocol2TypeId == nil ? ownType : typeChange?.replacementId ?? ownType
        var command = command
        var refused: [InventoryCatalogueChange] = []
        for change in replacements where change.definition == .field {
            guard names(command, change.id, itemTypeId: itemTypeId) else { continue }
            if let next = movedField(command, change, landingType: landingType) {
                command = next
            } else {
                refused.append(change)
            }
        }
        if let typeChange {
            if let next = movedType(command, typeChange) {
                command = next
            } else {
                refused.append(typeChange)
            }
        }
        return Moved(command: command, refused: refused)
    }

    /// The replacements `target` records for the type and fields `command`
    /// writes, where the authored revision still had them live: the lineage
    /// a move tries when the server named none, as when it could not judge
    /// the change's revision at all. A cleared field is never replaced.
    func recorded(for command: InventoryCommand) -> [InventoryCatalogueChange] {
        let revision = target.revision.revision
        var changes: [InventoryCatalogueChange] = []
        if let typeId = command.protocol2TypeId,
            authored?.types.first(where: { $0.id == typeId })?.archivedAt == nil,
            let replacement = target.replacingType(typeId)
        {
            changes.append(
                InventoryCatalogueChange(
                    definition: .type, id: typeId, typeId: typeId, change: .replaced,
                    replacementId: replacement.id, revision: revision))
        }
        for fieldId in command.protocol2WrittenFieldIds
        where field(fieldId, in: authored)?.archivedAt == nil {
            guard let replaced = field(fieldId, in: target),
                let replacement = target.replacingField(fieldId)
            else { continue }
            changes.append(
                InventoryCatalogueChange(
                    definition: .field, id: fieldId, typeId: replaced.typeId, fieldId: fieldId,
                    change: .replaced, replacementId: replacement.id, revision: revision))
        }
        return changes
    }

    private func movedField(
        _ command: InventoryCommand, _ change: InventoryCatalogueChange, landingType: String?
    ) -> InventoryCommand? {
        guard let new = change.replacementId,
            let before = field(change.id, in: authored) ?? field(change.id, in: target),
            let after = field(new, in: target), after.archivedAt == nil,
            Self.sameShape(before, after), !command.protocol2FieldIds.contains(new),
            after.typeId == landingType
        else { return nil }
        return command.renamingField(change.id, to: new)
    }

    private func movedType(
        _ command: InventoryCommand, _ change: InventoryCatalogueChange
    ) -> InventoryCommand? {
        guard let new = change.replacementId,
            let type = target.types.first(where: { $0.id == new }), type.archivedAt == nil
        else { return nil }
        let stored = Set(
            type.fields.filter { $0.storage == .stored && $0.archivedAt == nil }.map(\.id))
        let computed = Set(
            type.fields.filter {
                $0.storage == .computed && $0.allowOverride && $0.archivedAt == nil
            }.map(\.id))
        switch command {
        case .createProtocol2Item(let item):
            guard item.values.allSatisfy({ stored.contains($0.fieldId) }),
                item.overrides.allSatisfy({ computed.contains($0.fieldId) })
            else { return nil }
            return .createProtocol2Item(
                InventoryNewProtocol2Item(
                    id: item.id, name: item.name, catalogueRevision: item.catalogueRevision,
                    typeId: new, values: item.values, overrides: item.overrides, note: item.note,
                    externalIds: item.externalIds, quantity: item.quantity,
                    placement: item.placement, code: item.code))
        case .changeProtocol2ItemType(let id, let revision, _, let values):
            guard values.allSatisfy({ stored.contains($0.fieldId) }) else { return nil }
            return .changeProtocol2ItemType(
                id: id, catalogueRevision: revision, typeId: new, values: values)
        default:
            return nil
        }
    }

    private func names(_ command: InventoryCommand, _ id: String, itemTypeId: String?) -> Bool {
        command.protocol2FieldIds.contains(id) || (command.protocol2TypeId ?? itemTypeId) == id
    }

    private func field(_ id: String, in snapshot: InventoryCatalogueSnapshot?)
        -> InventoryCatalogueField?
    {
        snapshot?.types.lazy.flatMap(\.fields).first { $0.id == id }
    }

    /// The server's `sameFieldShape`.
    static func sameShape(_ lhs: InventoryCatalogueField, _ rhs: InventoryCatalogueField) -> Bool {
        lhs.kind == rhs.kind && lhs.cardinality == rhs.cardinality && lhs.storage == rhs.storage
            && lhs.fixedUnit == rhs.fixedUnit && lhs.references == rhs.references
    }
}

extension InventoryCommand {
    /// The type a new item or a type change names; nil for an edit, which
    /// keeps the item's own.
    var protocol2TypeId: String? {
        switch self {
        case .createProtocol2Item(let item): item.typeId
        case .changeProtocol2ItemType(_, _, let typeId, _): typeId
        default: nil
        }
    }

    /// Every field a protocol-2 command writes a value to, leaving out the
    /// fields an edit clears.
    var protocol2WrittenFieldIds: [String] {
        switch self {
        case .editProtocol2Item(_, _, let patches):
            patches.filter { $0.values != nil }.map(\.fieldId)
        default: protocol2FieldIds
        }
    }

    /// Every field a protocol-2 command carries values for.
    var protocol2FieldIds: [String] {
        switch self {
        case .createProtocol2Item(let item): (item.values + item.overrides).map(\.fieldId)
        case .editProtocol2Item(_, _, let patches): patches.map(\.fieldId)
        case .changeProtocol2ItemType(_, _, _, let values): values.map(\.fieldId)
        default: []
        }
    }

    /// This command with `old`'s values carried by `new` instead.
    func renamingField(_ old: String, to new: String) -> InventoryCommand {
        func rename(_ id: String) -> String { id == old ? new : id }
        switch self {
        case .createProtocol2Item(let item):
            return .createProtocol2Item(
                InventoryNewProtocol2Item(
                    id: item.id, name: item.name, catalogueRevision: item.catalogueRevision,
                    typeId: item.typeId,
                    values: item.values.map {
                        .init(fieldId: rename($0.fieldId), values: $0.values)
                    },
                    overrides: item.overrides.map {
                        .init(fieldId: rename($0.fieldId), values: $0.values)
                    },
                    note: item.note, externalIds: item.externalIds, quantity: item.quantity,
                    placement: item.placement, code: item.code))
        case .editProtocol2Item(let id, let revision, let patches):
            return .editProtocol2Item(
                id: id, catalogueRevision: revision,
                values: patches.map { .init(fieldId: rename($0.fieldId), values: $0.values) })
        case .changeProtocol2ItemType(let id, let revision, let typeId, let values):
            return .changeProtocol2ItemType(
                id: id, catalogueRevision: revision, typeId: typeId,
                values: values.map { .init(fieldId: rename($0.fieldId), values: $0.values) })
        default:
            return self
        }
    }
}
