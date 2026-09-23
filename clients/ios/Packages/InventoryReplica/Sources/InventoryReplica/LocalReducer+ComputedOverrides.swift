import AppCore

/// `item-override.ts`: an explicit value that supersedes an overridable
/// computed field, and its removal. Clearing one resumes evaluation: the
/// logging transaction re-evaluates the field over the phone's rows
/// (``LocalComputedValues``) rather than showing the value it had before.
extension LocalReducer {
    func setComputedOverride(id: String, fieldId: String, value: InventoryPrimitiveValue)
        throws -> Written
    {
        let before = try liveItem(id)
        let (field, revision) = try overridableField(of: before, fieldId: fieldId)
        guard primitiveKind(of: value, matches: field.kind) else {
            throw refusal(.invalid, "field \(fieldId) does not hold a \(field.kind.rawValue)")
        }
        var after = before
        after.fieldValues =
            withoutOverride(before.fieldValues, fieldId: fieldId) + [
                InventoryItemFieldEntry(
                    fieldId: fieldId, state: .value([value]), source: .override,
                    catalogueRevision: revision)
            ]
        return try update(before, to: after, kind: "override_set") ?? unchanged(before)
    }

    func clearComputedOverride(id: String, fieldId: String) throws -> Written {
        let before = try liveItem(id)
        _ = try overridableField(of: before, fieldId: fieldId)
        var after = before
        after.fieldValues = withoutOverride(before.fieldValues, fieldId: fieldId)
        return try update(before, to: after, kind: "override_cleared") ?? unchanged(before)
    }

    private func withoutOverride(_ entries: [InventoryItemFieldEntry], fieldId: String)
        -> [InventoryItemFieldEntry]
    {
        entries.filter { !($0.fieldId == fieldId && $0.source == .override) }
    }

    /// `requireOverrideField`: the field must be declared on the item's type
    /// in the catalogue revision this phone writes against, computed, and
    /// open to overrides. An item migrated from protocol 1 names its type by
    /// key only, as the server's own seed rows do.
    private func overridableField(of item: WorkingItem, fieldId: String) throws
        -> (InventoryCatalogueField, Int)
    {
        guard let revision = try SyncMeta.read(db).catalogueRevision,
            let catalogue = try Protocol2CatalogueRows.read(revision: revision, in: db)
        else {
            throw refusal(.invalid, "override mutations require catalogueRevision")
        }
        guard item.typeId != nil || item.typeKey != nil else {
            throw refusal(.typeUnknown, "an untyped item has no fields")
        }
        let type = catalogue.types.first { candidate in
            if let typeId = item.typeId { return candidate.id == typeId }
            return candidate.key == item.typeKey
        }
        guard let type else {
            throw refusal(.typeUnknown, "unknown type \(item.typeId ?? item.typeKey ?? "")")
        }
        guard let field = type.fields.first(where: { $0.id == fieldId }) else {
            throw refusal(.invalid, "field \(fieldId) is not declared")
        }
        guard field.storage == .computed, field.allowOverride else {
            throw refusal(.invalid, "field \(fieldId) does not permit an override")
        }
        return (field, revision)
    }
}
