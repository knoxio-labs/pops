import AppCore

internal enum InventoryProtocol2Display {
    internal static func text(
        for values: [InventoryPrimitiveValue], field: InventoryCatalogueField,
        referenceLabel: (InventoryReferenceValue) -> String?
    ) -> String {
        guard !values.isEmpty else { return "Not available" }
        return values.map {
            valueText($0, field: field, referenceLabel: referenceLabel)
        }.joined(separator: " · ")
    }

    internal static func unavailable(_ reason: InventoryValueUnavailableReason) -> String {
        switch reason {
        case .missingDependency: "Unavailable because a required value is missing"
        case .referenceUnresolved: "Unavailable until the referenced record is downloaded"
        case .referenceMissing: "Unavailable because the referenced record is missing"
        case .referenceDeleted: "Unavailable because the referenced record was deleted"
        case .evaluationError: "Unavailable because the calculation failed"
        }
    }

    private static func valueText(
        _ primitive: InventoryPrimitiveValue, field: InventoryCatalogueField,
        referenceLabel: (InventoryReferenceValue) -> String?
    ) -> String {
        switch primitive {
        case .string(let value): return value
        case .integer(let value): return String(value.value)
        case .decimal(let value):
            return InventoryProtocol2DecimalDisplay.format(value.text, field: field)
        case .boolean(let value): return value ? "Yes" : "No"
        case .enumeration(let optionId):
            return enumeration(optionId, field: field)
        case .measurement(let amount, let unit):
            return "\(InventoryProtocol2DecimalDisplay.format(amount.text, field: field)) \(unit)"
        case .date(let value): return value.text
        case .dateTime(let value): return value.text
        case .url(let value): return value.text
        case .reference(let value):
            return reference(value, label: referenceLabel(value))
        }
    }

    private static func enumeration(
        _ optionId: String, field: InventoryCatalogueField
    ) -> String {
        guard let option = field.enumOptions.first(where: { $0.id == optionId }) else {
            return "Unknown option"
        }
        return InventoryProtocol2EnumOptions.label(of: option)
    }

    private static func reference(
        _ value: InventoryReferenceValue, label: String?
    ) -> String {
        if let label { return label }
        switch value.targetState {
        case .deleted: return "Deleted \(value.targetKind.label.lowercased())"
        case .missing: return "Missing \(value.targetKind.label.lowercased())"
        case .unresolved, .none:
            return "Unresolved \(value.targetKind.label.lowercased())"
        case .resolved: return value.targetId
        }
    }
}
