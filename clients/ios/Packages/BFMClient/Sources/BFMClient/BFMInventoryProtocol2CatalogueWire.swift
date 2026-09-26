import AppCore
import OpenAPIRuntime

/// Maps the exact protocol-2 catalogue revision before the replica applies dependent rows.
internal func protocol2Catalogue(
    from payload: Operations.MobileInventory_catalogueRevision.Output.Ok.Body.JsonPayload
) throws -> InventoryCatalogueSnapshot {
    guard
        let status = InventoryCatalogueRevisionStatus(
            rawValue: payload.revision.status.rawValue)
    else {
        throw RepositoryError.contractMismatch
    }
    let revision = InventoryCatalogueRevision(
        revision: payload.revision.revision,
        baseRevision: payload.revision.baseRevision,
        status: status,
        minimumProtocol: payload.revision.minimumProtocol
    )
    let types = try payload.types.map { type in
        guard type.revision == revision.revision else { throw RepositoryError.contractMismatch }
        return InventoryCatalogueType(
            id: type.id, key: type.key, label: type.label, description: type.description,
            sortOrder: type.sortOrder, fields: try type.fields.map(protocol2Field(from:)),
            capabilities: type.capabilities, legacyLabels: type.legacyLabels,
            presentation: try protocol2JSON(object: type.presentation.additionalProperties),
            archivedAt: type.archivedAt, replacedBy: type.replacedBy
        )
    }
    return InventoryCatalogueSnapshot(revision: revision, types: types)
}

private typealias Protocol2FieldPayload =
    Operations.MobileInventory_catalogueRevision.Output.Ok.Body.JsonPayload.TypesPayloadPayload
    .FieldsPayloadPayload

private func protocol2Field(from wire: Protocol2FieldPayload) throws -> InventoryCatalogueField {
    guard let kind = InventoryPrimitiveKind(rawValue: wire.kind.rawValue),
        let cardinality = InventoryFieldCardinality(rawValue: wire.cardinality.rawValue),
        let storage = InventoryFieldStorage(rawValue: wire.storage.rawValue)
    else { throw RepositoryError.contractMismatch }
    let targetKinds = try Set(
        wire.referenceKinds.map {
            guard let kind = InventoryReferenceTargetKind(rawValue: $0.rawValue) else {
                throw RepositoryError.contractMismatch
            }
            return kind
        }
    )
    return InventoryCatalogueField(
        id: wire.id, typeId: wire.typeId, key: wire.key, label: wire.label, help: wire.help,
        sortOrder: wire.sortOrder, kind: kind, cardinality: cardinality, required: wire.required,
        storage: storage, fixedUnit: wire.fixedUnit,
        references: InventoryReferenceConstraint(
            targetKinds: targetKinds, targetTypeIds: Set(wire.referenceTypeIds)),
        expressionVersion: wire.expressionVersion,
        expression: try wire.expression.map(protocol2JSON(from:)),
        allowOverride: wire.allowOverride,
        defaultValues: try protocol2DefaultValues(
            of: wire, kind: kind, cardinality: cardinality, storage: storage),
        presentation: try protocol2JSON(object: wire.presentation.additionalProperties),
        archivedAt: wire.archivedAt, replacedBy: wire.replacedBy,
        enumOptions: wire.enumOptions.map {
            InventoryCatalogueOption(
                id: $0.id, key: $0.key, label: $0.label, sortOrder: $0.sortOrder,
                archivedAt: $0.archivedAt)
        }
    )
}

/// A field's defaults, typed by its kind as an item's stored values are. A
/// default the contract rules out (on a computed or reference field, more
/// than one on a one-value field, not a value of the field's kind and unit,
/// or an option the field does not offer unarchived) is a contract mismatch,
/// never dropped.
private func protocol2DefaultValues(
    of field: Protocol2FieldPayload, kind: InventoryPrimitiveKind,
    cardinality: InventoryFieldCardinality, storage: InventoryFieldStorage
) throws -> [InventoryPrimitiveValue] {
    let wire = field.defaultValues ?? []
    guard !wire.isEmpty else { return [] }
    let activeOptionIds = Set(field.enumOptions.filter { $0.archivedAt == nil }.map(\.id))
    guard storage == .stored, kind != .reference, cardinality == .many || wire.count == 1 else {
        throw RepositoryError.contractMismatch
    }
    return try wire.map { container in
        guard let value = try protocol2Value(from: container).conformed(to: kind) else {
            throw RepositoryError.contractMismatch
        }
        if case .measurement(_, let unit) = value, unit != field.fixedUnit {
            throw RepositoryError.contractMismatch
        }
        if case .enumeration(let optionId) = value, !activeOptionIds.contains(optionId) {
            throw RepositoryError.contractMismatch
        }
        return value
    }
}

private func protocol2JSON(object: [String: OpenAPIValueContainer]) throws -> InventoryJSON {
    .object(try object.mapValues(protocol2JSON(from:)))
}

private func protocol2JSON(from container: OpenAPIValueContainer) throws -> InventoryJSON {
    switch container.value {
    case nil: return .null
    case let value as Bool: return .boolean(value)
    case let value as String: return .string(value)
    case let value as Int: return .number(String(value))
    case let value as Double: return .number(String(value))
    case let value as [(any Sendable)?]:
        return .array(try value.map { try protocol2JSON(value: $0) })
    case let value as [String: (any Sendable)?]:
        return .object(try value.mapValues { try protocol2JSON(value: $0) })
    default: throw RepositoryError.contractMismatch
    }
}

private func protocol2JSON(value: (any Sendable)?) throws -> InventoryJSON {
    switch value {
    case nil: return .null
    case let value as Bool: return .boolean(value)
    case let value as String: return .string(value)
    case let value as Int: return .number(String(value))
    case let value as Double: return .number(String(value))
    case let value as [(any Sendable)?]:
        return .array(try value.map { try protocol2JSON(value: $0) })
    case let value as [String: (any Sendable)?]:
        return .object(try value.mapValues { try protocol2JSON(value: $0) })
    default: throw RepositoryError.contractMismatch
    }
}
