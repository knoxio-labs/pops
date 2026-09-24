import AppCore

extension LocalReducer {
    func createProtocol2Item(_ new: InventoryNewProtocol2Item) throws -> Written {
        try requireUUID(new.id, for: "item.create")
        let name = try requiredName(new.name)
        guard new.quantity >= 1 else { throw refusal(.invalid, "a quantity is at least 1") }
        guard try item(new.id) == nil else {
            throw refusal(.invalid, "item \(new.id) already exists")
        }
        let type = try protocol2Type(id: new.typeId, revision: new.catalogueRevision)
        let values = try protocol2Entries(
            new.values, type: type, revision: new.catalogueRevision)
        let isContainer = type.capabilities.contains("containment")
        try assertPlacementAllowed(itemId: new.id, to: new.placement)
        try assertContainerQuantity(isContainer: isContainer, quantity: new.quantity)
        let code = try new.code.map { try freeCode($0, for: new.id) }
        noteReference(new.placement)
        let row = WorkingItem(
            id: new.id, revision: 1, seq: 0, catalogueRevision: new.catalogueRevision,
            name: name, typeId: new.typeId, typeKey: nil, fieldValues: values, legacyType: nil,
            fields: [:], note: normalizedNote(new.note),
            code: code, externalIds: try storedExternalIds(new.externalIds), quantity: new.quantity,
            lifecycle: "active", lifecycleChangedAt: nil,
            placement: StoredPlacement(new.placement), previousPlacement: nil,
            containment: isContainer ? StoredContainment(access: "open", isFull: false) : nil,
            photos: [], provenance: nil, documents: .none, documentTitles: [], createdAt: now,
            updatedAt: now, deletedAt: nil)
        return try create(row, kind: "created")
    }

    func editProtocol2Item(
        id: String, catalogueRevision: Int, values: [InventoryProtocol2FieldPatch]
    ) throws -> Written {
        let before = try liveItem(id)
        guard let typeId = before.typeId else {
            throw refusal(
                .invalid, "item \(id) does not use catalogue revision \(catalogueRevision)")
        }
        let type = try protocol2Type(id: typeId, revision: catalogueRevision)
        let baseline = try rebasedStoredFieldValues(
            of: before, typeId: typeId, target: catalogueRevision)
        var entries = Dictionary(uniqueKeysWithValues: baseline.map { ($0.fieldId, $0) })
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
        after.catalogueRevision = catalogueRevision
        after.fieldValues = replacement
        return try update(before, to: after, kind: "edited") ?? unchanged(before)
    }

    /// `item`'s own stored field values, moved onto `target` when the item
    /// has not itself caught up to that catalogue revision yet: a command
    /// authored or rebased against a newer revision than the one this
    /// item's row carries (POPS-4405's drain rebase, or the catalogue-repair
    /// "Edit item" path, reaching a replica that has not synced the item's
    /// migration back yet).
    ///
    /// Judged the same way ``CatalogueRebase`` judges a queued command:
    /// schema only, against the field ids this item currently stores (an
    /// override is untouched either way). A field this item still carries
    /// that the newer revision no longer has as it was refuses the edit,
    /// same as a stale revision always has; the server has the final word
    /// once the change reaches it.
    ///
    /// - Throws: ``AppCore/InventoryCommandError`` when `target` is older
    ///   than the item's own revision, or the item's fields do not fit it.
    private func rebasedStoredFieldValues(
        of item: WorkingItem, typeId: String, target: Int
    ) throws -> [InventoryItemFieldEntry] {
        // A typed item holding no values names no revision: there is nothing to rebase.
        guard let current = item.catalogueRevision else { return item.fieldValues }
        guard current != target else { return item.fieldValues }
        guard current < target,
            let targetCatalogue = try Protocol2CatalogueRows.read(revision: target, in: db)
        else {
            throw refusal(
                .invalid, "item \(item.id) does not use catalogue revision \(target)")
        }
        let authoredCatalogue = try Protocol2CatalogueRows.read(revision: current, in: db)
        let check = CatalogueCompatibility(authored: authoredCatalogue, target: targetCatalogue)
        let stored = item.fieldValues.filter { $0.source != .override }
        let values = stored.flatMap { entry -> [InventoryPrimitiveValue] in
            guard case .value(let values) = entry.state else { return [] }
            return values
        }
        if let incompatible = check.incompatibility(
            typeId: typeId, fieldIds: stored.map(\.fieldId), values: values, requiresAll: false)
        {
            throw refusal(
                .invalid,
                "item \(item.id) does not use catalogue revision \(target): \(incompatible.summary)"
            )
        }
        return item.fieldValues.map { entry in
            entry.source == .override
                ? entry
                : InventoryItemFieldEntry(
                    fieldId: entry.fieldId, state: entry.state, source: entry.source,
                    catalogueRevision: target, dependencies: entry.dependencies)
        }
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
        try assertContainerQuantity(
            isContainer: type.capabilities.contains("containment"), quantity: before.quantity)
        var after = before
        after.catalogueRevision = catalogueRevision
        after.typeId = typeId
        after.typeKey = nil
        after.fieldValues = entries
        after.containment =
            type.capabilities.contains("containment")
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
        for entry in entries where entry.source != .override {
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

    func primitiveKind(
        of value: InventoryPrimitiveValue, matches field: InventoryPrimitiveKind
    ) -> Bool {
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
}
