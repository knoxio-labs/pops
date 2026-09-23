import AppCore
import OpenAPIRuntime

/// Maps protocol-2 stable-ID values without applying them to the replica.
internal func protocol2FieldValues(
    from wire: [WireProtocol2FieldValue]
) throws -> [InventoryItemFieldEntry] {
    try wire.map { field in
        InventoryItemFieldEntry(
            fieldId: field.fieldId,
            state: .value(try field.values.map(protocol2Value(from:))),
            source: field.source,
            catalogueRevision: field.catalogueRevision
        )
    }
}

internal func protocol2Value(from container: OpenAPIValueContainer) throws -> InventoryPrimitiveValue
{
    switch container.value {
    case let value as String:
        return .string(value)
    case let value as Bool:
        return .boolean(value)
    case let value as Int:
        return .integer(try InventoryInteger(Int64(value)))
    case let value as [String: (any Sendable)?]:
        return try protocol2ObjectValue(value)
    default:
        throw RepositoryError.contractMismatch
    }
}

private func protocol2ObjectValue(
    _ value: [String: (any Sendable)?]
) throws -> InventoryPrimitiveValue {
    if value.count == 1, let optionId = string(value["optionId"]) {
        return .enumeration(optionId: optionId)
    }
    if value.count == 2, let amount = string(value["amount"]), let unit = string(value["unit"]) {
        return .measurement(amount: try InventoryDecimal(amount), unit: unit)
    }
    if value.count == 2, let kind = string(value["targetKind"]), let id = string(value["targetId"]),
        let targetKind = InventoryReferenceTargetKind(rawValue: kind)
    {
        return .reference(.init(targetKind: targetKind, targetId: id))
    }
    if value.count == 3, let kind = string(value["targetKind"]), let id = string(value["targetId"]),
        let state = string(value["targetState"]),
        let targetKind = InventoryReferenceTargetKind(rawValue: kind),
        let targetState = InventoryReferenceState(rawValue: state)
    {
        return .reference(.init(targetKind: targetKind, targetId: id, targetState: targetState))
    }
    throw RepositoryError.contractMismatch
}

private func string(_ value: (any Sendable)??) -> String? {
    value.flatMap { $0 } as? String
}
