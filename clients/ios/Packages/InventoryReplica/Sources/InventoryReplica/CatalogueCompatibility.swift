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

    private func incompatibility(
        typeId: String, fieldIds: [String], values: [InventoryPrimitiveValue],
        requiresAll: Bool
    ) -> InventoryCatalogueChange? {
        guard let type = target.types.first(where: { $0.id == typeId }) else {
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

    private func fieldIncompatibility(
        type: InventoryCatalogueType, fieldIds: [String]
    ) -> InventoryCatalogueChange? {
        let fields = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.id, $0) })
        let before = authored?.types.first { $0.id == type.id }.map { authoredType in
            Dictionary(uniqueKeysWithValues: authoredType.fields.map { ($0.id, $0) })
        }
        for fieldId in fieldIds {
            guard let field = fields[fieldId] else {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .notInRevision)
            }
            if field.archivedAt != nil {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .archived)
            }
            let shapeChanged = before?[fieldId].map { !CatalogueReplacement.sameShape($0, field) }
            if field.storage != .stored || shapeChanged == true {
                return change(.field, fieldId, typeId: type.id, fieldId: fieldId, .redefined)
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
