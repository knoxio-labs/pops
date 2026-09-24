import AppCore
import GRDB

/// Types every value a page delivers by the kind its catalogue field
/// declares, before anything is stored. The wire leaves a decimal, date,
/// date-time and URL as plain strings, and a computed value is stored whole,
/// so this is the one place its kind is decided.
///
/// A value that is not its field's kind, a stored measurement in any unit
/// but its field's fixed one, or a value naming a field its catalogue
/// revision does not declare, is ``RepositoryError/contractMismatch``: the
/// page's transaction rolls back and nothing of it is stored, where storing it
/// would break every later read of the item. Sync fetches every revision a
/// page's values name before applying it, so each is held by now.
internal enum ReplicaValueKinds {
    static func conformed(_ entries: [InventoryItemFieldEntry], in db: Database) throws
        -> [InventoryItemFieldEntry]
    {
        try entries.map { entry in
            guard entry.source != .computed, case .value(let values) = entry.state else {
                return entry
            }
            let field = try field(id: entry.fieldId, revision: entry.catalogueRevision, in: db)
            return InventoryItemFieldEntry(
                fieldId: entry.fieldId,
                state: .value(try values.map { try conformStored($0, to: field) }),
                source: entry.source, catalogueRevision: entry.catalogueRevision,
                dependencies: entry.dependencies)
        }
    }

    static func conformed(_ values: [InventoryComputedValue], in db: Database) throws
        -> [InventoryComputedValue]
    {
        try values.map { value in
            let evaluation: InventoryComputedEvaluation
            switch value.evaluation {
            case .ok(let primitive):
                evaluation = .ok(try conform(primitive, kind(of: value, in: db)))
            case .overridden(let primitive, let revision):
                evaluation = .overridden(
                    try conform(primitive, kind(of: value, in: db)),
                    overrideCatalogueRevision: revision)
            case .unavailable: return value
            }
            return InventoryComputedValue(
                fieldId: value.fieldId, catalogueRevision: value.catalogueRevision,
                evaluation: evaluation, dependencies: value.dependencies,
                traversedItemIds: value.traversedItemIds,
                evaluatedItemRevision: value.evaluatedItemRevision)
        }
    }

    private static func kind(of value: InventoryComputedValue, in db: Database) throws
        -> InventoryPrimitiveKind
    {
        try field(id: value.fieldId, revision: value.catalogueRevision, in: db).kind
    }

    private static func conformStored(_ value: InventoryPrimitiveValue, to field: FieldShape)
        throws -> InventoryPrimitiveValue
    {
        let conformed = try conform(value, field.kind)
        if case .measurement(_, let unit) = conformed, unit != field.fixedUnit {
            throw RepositoryError.contractMismatch
        }
        return conformed
    }

    private static func conform(_ value: InventoryPrimitiveValue, _ kind: InventoryPrimitiveKind)
        throws -> InventoryPrimitiveValue
    {
        guard let conformed = value.conformed(to: kind) else {
            throw RepositoryError.contractMismatch
        }
        return conformed
    }

    private struct FieldShape {
        let kind: InventoryPrimitiveKind
        let fixedUnit: String?
    }

    private static func field(id: String, revision: Int, in db: Database) throws -> FieldShape {
        let row = try Row.fetchOne(
            db, sql: "SELECT kind, fixed_unit FROM catalogue_field WHERE id = ? AND revision = ?",
            arguments: [id, revision])
        guard let row else { throw RepositoryError.contractMismatch }
        let kindText: String = row["kind"]
        guard let kind = InventoryPrimitiveKind(rawValue: kindText) else {
            throw InventoryReplicaError.corruptValue("primitive kind \(kindText)")
        }
        return FieldShape(kind: kind, fixedUnit: row["fixed_unit"])
    }
}
