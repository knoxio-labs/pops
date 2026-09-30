import AppCore
import GRDB

/// Whether a protocol-2 command authored against one catalogue revision
/// still fits a newer one, schema only, naming the first definition in the
/// way (``CatalogueRebase``).
internal struct CatalogueCompatibility {
    let authored: InventoryCatalogueSnapshot?
    let target: InventoryCatalogueSnapshot

    private var revision: Int { target.revision.revision }

    func incompatibility(
        of command: InventoryCommand, itemTypeId: String?
    ) -> InventoryCatalogueChange? {
        switch command {
        case .createProtocol2Item(let new):
            return incompatibility(
                typeId: new.typeId, fieldIds: new.values.map(\.fieldId),
                values: new.values.flatMap(\.values), requiresAll: true)
                ?? overrideIncompatibility(
                    typeId: new.typeId, fieldIds: new.overrides.map(\.fieldId))
        case .editProtocol2Item(let id, _, let patches):
            guard let itemTypeId else {
                return InventoryCatalogueChange(
                    definition: .type, id: id, change: .notInRevision, revision: revision)
            }
            return incompatibility(
                typeId: itemTypeId, fieldIds: patches.map(\.fieldId),
                values: patches.flatMap { $0.values ?? [] }, requiresAll: false)
        case .changeProtocol2ItemType(_, _, let typeId, let values):
            return incompatibility(
                typeId: typeId, fieldIds: values.map(\.fieldId),
                values: values.flatMap(\.values), requiresAll: true)
        default:
            return nil
        }
    }

    /// The schema-only judgement ``incompatibility(of:itemTypeId:)`` applies
    /// to a command's own fields.
    func incompatibility(
        typeId: String, fieldIds: [String], values: [InventoryPrimitiveValue],
        requiresAll: Bool
    ) -> InventoryCatalogueChange? {
        guard let found = target.types.first(where: { $0.id == typeId }),
            let type = target.effectiveType(id: found.id)
        else {
            return change(.type, typeId, typeId: typeId, .notInRevision)
        }
        if type.archivedAt != nil { return change(.type, typeId, typeId: typeId, .archived) }
        if let field = fieldIncompatibility(type: type, fieldIds: fieldIds) { return field }
        let liveOptions = Set(
            type.fields.flatMap(\.enumOptions).filter { $0.archivedAt == nil }.map(\.id))
        for case .enumeration(let optionId) in values where !liveOptions.contains(optionId) {
            let owner = type.fields.first { $0.enumOptions.contains { $0.id == optionId } }
            let kind: InventoryCatalogueChangeKind = owner == nil ? .notInRevision : .retired
            return change(.option, optionId, typeId: typeId, fieldId: owner?.id, kind)
        }
        guard requiresAll else { return nil }
        let supplied = Set(fieldIds)
        for field in type.fields
        where field.required && field.storage == .stored && field.archivedAt == nil
            && !supplied.contains(field.id)
        {
            return change(.field, field.id, typeId: typeId, fieldId: field.id, .nowRequired)
        }
        return nil
    }

    /// Whether values an item already holds can be carried onto the target
    /// revision unchanged. Looser than ``incompatibility(typeId:fieldIds:values:requiresAll:)``
    /// in the way the server is: an archived type, an archived field or a
    /// retired option may keep what it has, it only refuses new values. A
    /// definition gone from the revision, or redefined, still refuses.
    func retainedIncompatibility(
        typeId: String, fieldIds: [String], values: [InventoryPrimitiveValue]
    ) -> InventoryCatalogueChange? {
        guard let found = target.types.first(where: { $0.id == typeId }),
            let type = target.effectiveType(id: found.id)
        else {
            return change(.type, typeId, typeId: typeId, .notInRevision)
        }
        if let field = fieldIncompatibility(type: type, fieldIds: fieldIds, retaining: true) {
            return field
        }
        let knownOptions = Set(type.fields.flatMap(\.enumOptions).map(\.id))
        for case .enumeration(let optionId) in values where !knownOptions.contains(optionId) {
            return change(.option, optionId, typeId: typeId, .notInRevision)
        }
        return nil
    }

    private func fieldIncompatibility(
        type: InventoryCatalogueType, fieldIds: [String], retaining: Bool = false
    ) -> InventoryCatalogueChange? {
        let fields = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.id, $0) })
        let before = authored?.effectiveType(id: type.id).map { authoredType in
            Dictionary(uniqueKeysWithValues: authoredType.fields.map { ($0.id, $0) })
        }
        for fieldId in fieldIds {
            guard let field = fields[fieldId] else {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .notInRevision)
            }
            if field.archivedAt != nil && !retaining {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .archived)
            }
            let shapeChanged = before?[fieldId].map { !CatalogueReplacement.sameShape($0, field) }
            if field.storage != .stored || shapeChanged == true {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .redefined)
            }
        }
        return nil
    }

    /// A new item's overrides still fit when each names a live computed field
    /// of the type that still allows overriding and kept its shape: the
    /// server validates them as `item.setOverride` would.
    private func overrideIncompatibility(
        typeId: String, fieldIds: [String]
    ) -> InventoryCatalogueChange? {
        guard let found = target.types.first(where: { $0.id == typeId }),
            let type = target.effectiveType(id: found.id)
        else { return nil }
        let before = authored?.effectiveType(id: typeId)
        for fieldId in fieldIds {
            guard let field = type.fields.first(where: { $0.id == fieldId }) else {
                return change(.field, fieldId, typeId: typeId, fieldId: fieldId, .notInRevision)
            }
            if field.archivedAt != nil {
                return change(.field, fieldId, typeId: typeId, fieldId: fieldId, .archived)
            }
            let authoredField = before?.fields.first { $0.id == fieldId }
            let shapeChanged = authoredField.map { !CatalogueReplacement.sameShape($0, field) }
            if field.storage != .computed || !field.allowOverride || shapeChanged == true {
                return change(.field, fieldId, typeId: typeId, fieldId: fieldId, .redefined)
            }
        }
        return nil
    }

    private func change(
        _ definition: InventoryCatalogueDefinition, _ id: String, typeId: String?,
        fieldId: String? = nil, _ kind: InventoryCatalogueChangeKind
    ) -> InventoryCatalogueChange {
        InventoryCatalogueChange(
            definition: definition, id: id, typeId: typeId, fieldId: fieldId, change: kind,
            revision: revision)
    }

    /// The type of the item `id`, as the server has it or as a queued create
    /// made it.
    static func typeId(ofItem id: String, in db: Database) throws -> String? {
        try String.fetchOne(
            db,
            sql: """
                SELECT COALESCE(
                    (SELECT type_id FROM item_base WHERE id = ?),
                    (SELECT type_id FROM item WHERE id = ?))
                """, arguments: [id, id])
    }
}
