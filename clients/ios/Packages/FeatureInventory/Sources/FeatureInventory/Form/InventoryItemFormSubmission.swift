import AppCore

/// The commands a draft becomes, and what stops it becoming any.
///
/// Pure, so the rules the form enforces can be tested without a view: only
/// the chosen type's fields are stored, a choice is only ever one the type
/// declares, a measurement keeps its unit, and the code travels in its own
/// command after the create rather than inside it, so a code
/// the server refuses leaves the item created.
internal enum InventoryItemFormSubmission {
    internal static func protocol2Create(
        _ draft: InventoryItemDraft, protocol2: InventoryProtocol2Draft,
        type: InventoryCatalogueType
    ) -> [InventoryCommand] {
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        var commands: [InventoryCommand] = [
            .createProtocol2Item(
                .init(
                    id: draft.id, name: draft.trimmedName,
                    catalogueRevision: protocol2.catalogueRevision, typeId: protocol2.typeId,
                    values: protocol2.completeValues(for: type), note: note.isEmpty ? nil : note,
                    externalIds: draft.externalIds, quantity: draft.quantity,
                    placement: draft.placement))
        ]
        if let code = draft.code.normalized {
            commands.append(.setItemCode(id: draft.id, code: code))
        }
        return commands + photoAttachCommands(for: draft.id, in: draft)
    }

    internal static func protocol2Edit(
        _ draft: InventoryItemDraft, protocol2: InventoryProtocol2Draft,
        type: InventoryCatalogueType, original: InventoryItem
    ) -> [InventoryCommand] {
        var commands: [InventoryCommand] = []
        if protocol2.typeId != original.typeId {
            commands.append(
                .changeProtocol2ItemType(
                    id: original.id, catalogueRevision: protocol2.catalogueRevision,
                    typeId: protocol2.typeId, values: protocol2.completeValues(for: type)))
        } else if !protocol2.patches(for: type).isEmpty {
            commands.append(
                .editProtocol2Item(
                    id: original.id, catalogueRevision: protocol2.catalogueRevision,
                    values: protocol2.patches(for: type)))
        }
        if let edit = editCommand(draft, original: original, catalogue: .init(version: "", units: [], types: []), retyped: false) {
            commands.append(edit)
        }
        if draft.code.normalized != original.code {
            commands.append(.setItemCode(id: original.id, code: draft.code.normalized))
        }
        if draft.quantity != original.quantity.count {
            commands.append(.setItemQuantity(id: original.id, quantity: draft.quantity))
        }
        if draft.placement != original.placement {
            commands.append(.moveItem(id: original.id, to: draft.placement, verb: .move))
        }
        return commands + photoAttachCommands(for: original.id, in: draft)
    }
    /// Everything that blocks the final action, in the order the form lists
    /// them.
    internal static func issues(
        for draft: InventoryItemDraft, catalogue: InventoryCatalogue
    ) -> [InventoryDraftIssue] {
        var issues: [InventoryDraftIssue] = []
        if !draft.isNamed { issues.append(.nameMissing) }
        if let holder = draft.code.heldBy { issues.append(.codeTaken(heldBy: holder)) }
        issues += draft.identifiers.filter { !$0.isComplete }.map {
            .identifierIncomplete(label: $0.label)
        }
        for field in declaredFields(of: draft, in: catalogue) {
            switch draft.entry(for: field, units: catalogue.units).value(for: field) {
            case .failure(let issue): issues.append(issue)
            case .success(nil) where field.required:
                issues.append(.fieldMissing(label: field.label))
            case .success: break
            }
        }
        return issues
    }

    /// `item.create`, then `item.setCode` when the draft carries a code, then
    /// `item.attachPhoto` for every photo the store took this session and has
    /// not yet attached (A22) — never for a photo already `attached`, and
    /// never for one that failed, whose bytes will not reach the server.
    internal static func create(
        _ draft: InventoryItemDraft, catalogue: InventoryCatalogue
    ) -> [InventoryCommand] {
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = InventoryNewItem(
            id: draft.id, name: draft.trimmedName, typeKey: draft.typeKey,
            fields: values(of: draft, in: catalogue), note: note.isEmpty ? nil : note,
            externalIds: draft.externalIds, quantity: draft.quantity, placement: draft.placement)
        var commands: [InventoryCommand] = [.createItem(item)]
        if let code = draft.code.normalized {
            commands.append(.setItemCode(id: draft.id, code: code))
        }
        commands += photoAttachCommands(for: draft.id, in: draft)
        return commands
    }

    /// Only what changed against `original`, one command per kind of change.
    internal static func edit(
        _ draft: InventoryItemDraft, original: InventoryItem, catalogue: InventoryCatalogue
    ) -> [InventoryCommand] {
        var commands: [InventoryCommand] = []
        let retyped = draft.typeKey != original.typeKey
        if retyped, let typeKey = draft.typeKey {
            commands.append(
                .changeItemType(
                    id: original.id, typeKey: typeKey, fields: values(of: draft, in: catalogue)))
        }
        if let edit = editCommand(draft, original: original, catalogue: catalogue, retyped: retyped)
        {
            commands.append(edit)
        }
        if draft.code.normalized != original.code {
            commands.append(.setItemCode(id: original.id, code: draft.code.normalized))
        }
        if draft.quantity != original.quantity.count {
            commands.append(.setItemQuantity(id: original.id, quantity: draft.quantity))
        }
        if draft.placement != original.placement {
            commands.append(.moveItem(id: original.id, to: draft.placement, verb: .move))
        }
        commands += photoAttachCommands(for: original.id, in: draft)
        return commands
    }

    /// One `item.attachPhoto` per photo ready to attach, positioned by where
    /// it sits in the draft's own strip (existing photos included), so a
    /// photo taken ahead of ones already on the item lands ahead of them
    /// server-side too.
    private static func photoAttachCommands(
        for itemId: InventoryItem.ID, in draft: InventoryItemDraft
    ) -> [InventoryCommand] {
        draft.photos.enumerated().compactMap { position, photo in
            guard photo.isReadyToAttach else { return nil }
            return .attachPhoto(itemId: itemId, sha256: photo.sha256, position: position)
        }
    }

    /// The chosen type's fields that hold a storable value, by key.
    internal static func values(
        of draft: InventoryItemDraft, in catalogue: InventoryCatalogue
    ) -> [String: InventoryFieldValue] {
        var values: [String: InventoryFieldValue] = [:]
        for field in declaredFields(of: draft, in: catalogue) {
            if case .success(let value?) = draft.entry(for: field, units: catalogue.units).value(
                for: field)
            {
                values[field.key] = value
            }
        }
        return values
    }

    internal static func declaredFields(
        of draft: InventoryItemDraft, in catalogue: InventoryCatalogue
    ) -> [InventoryFieldDefinition] {
        draft.typeKey.flatMap { catalogue.type(forKey: $0) }?.fields ?? []
    }

    private static func editCommand(
        _ draft: InventoryItemDraft, original: InventoryItem, catalogue: InventoryCatalogue,
        retyped: Bool
    ) -> InventoryCommand? {
        let name = draft.trimmedName == original.name ? nil : draft.trimmedName
        let note = noteUpdate(draft.note, original: original.note)
        let fields = retyped ? [:] : fieldPatch(draft, original: original, catalogue: catalogue)
        let externalIds = draft.externalIds == original.externalIds ? nil : draft.externalIds
        guard name != nil || note != .unchanged || !fields.isEmpty || externalIds != nil else {
            return nil
        }
        return .editItem(
            id: original.id, name: name, note: note, fields: fields, externalIds: externalIds)
    }

    private static func noteUpdate(_ note: String, original: String?) -> InventoryFieldUpdate<
        String
    > {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        switch (trimmed.isEmpty, original) {
        case (true, nil): return .unchanged
        case (true, .some): return .cleared
        case (false, .some(let stored)) where stored == trimmed: return .unchanged
        case (false, _): return .set(trimmed)
        }
    }

    private static func fieldPatch(
        _ draft: InventoryItemDraft, original: InventoryItem, catalogue: InventoryCatalogue
    ) -> [String: InventoryFieldValue?] {
        let values = values(of: draft, in: catalogue)
        var patch: [String: InventoryFieldValue?] = [:]
        for field in declaredFields(of: draft, in: catalogue)
        where draft.touchedFields.contains(field.key)
            && values[field.key] != original.fields[field.key]
        {
            patch[field.key] = .some(values[field.key])
        }
        return patch
    }
}
