import AppCore

/// One computed field's line on Item detail, from the server's evaluation
/// reconciled with this phone's own changes
/// (``InventoryComputedValue/display(in:revisionOf:)``). A field with no
/// evaluation yet, such as one on an item created offline, reads as waiting
/// for sync rather than blank.
internal struct InventoryComputedDetailLine {
    internal let item: InventoryItem
    internal let type: InventoryCatalogueType
    internal let source: any InventoryQuerySource

    internal func line(for field: InventoryCatalogueField) -> InventoryDetailField {
        let (value, lineSource) = text(for: field, display: display(of: field))
        return InventoryDetailField(
            key: field.id, label: field.label, value: value, source: lineSource)
    }

    private func display(of field: InventoryCatalogueField) -> InventoryComputedDisplay {
        if let computed = item.computedValues.first(where: { $0.fieldId == field.id }) {
            return computed.display(in: item) { source.inventoryItem(id: $0)?.revision }
        }
        let localOverride = item.fieldValues.first {
            $0.fieldId == field.id && $0.source == .override
        }
        if case .value(let values)? = localOverride?.state, let value = values.first {
            return .overridden(value)
        }
        return .outOfDate
    }

    private func text(for field: InventoryCatalogueField, display: InventoryComputedDisplay)
        -> (String, InventoryDetailFieldSource)
    {
        switch display {
        case .value(let value):
            return (valueText(value, field: field), .calculated)
        case .overridden(let value):
            return (valueText(value, field: field), .overridden)
        case .unavailable(let reason, let failedFieldId):
            return (unavailableText(reason: reason, failedFieldId: failedFieldId), .unavailable)
        case .outOfDate:
            return ("Out of date", .outOfDate)
        }
    }

    private func valueText(_ value: InventoryPrimitiveValue, field: InventoryCatalogueField)
        -> String
    {
        InventoryProtocol2Display.text(for: [value], field: field) {
            InventoryDetailFields.referenceLabel($0, source: source)
        }
    }

    private func unavailableText(reason: String, failedFieldId: String) -> String {
        guard let known = InventoryValueUnavailableReason(rawValue: reason) else {
            return "Unavailable"
        }
        let missing = type.fields.first { $0.id == failedFieldId }
        if known == .missingDependency, let missing {
            return "Unavailable until \(missing.label) is set"
        }
        return InventoryProtocol2Display.unavailable(known)
    }
}
