import AppCore

/// One computed field's line on Item detail, from the server's evaluation
/// reconciled with this phone's own changes
/// (``InventoryComputedValue/display(in:activeCatalogueRevision:revisionOf:)``).
/// A field with no evaluation yet, such as one on an item created offline,
/// reads as waiting for sync rather than blank.
internal struct InventoryComputedDetailLine {
    internal let item: InventoryItem
    internal let type: InventoryCatalogueType
    internal let source: any InventoryQuerySource
    /// The catalogue revision the phone reads now; an evaluation against an
    /// older one reads as out of date.
    internal let activeCatalogueRevision: Int?

    internal func line(for field: InventoryCatalogueField) -> InventoryDetailField {
        let display = display(of: field)
        let missing = missingInputs(of: field, display: display)
        let (value, lineSource) = text(for: field, display: display, missing: missing)
        return InventoryDetailField(
            key: field.id, label: field.label, value: value, source: lineSource,
            missingInputs: InventoryMissingInputs.listed(missing))
    }

    private func missingInputs(
        of field: InventoryCatalogueField, display: InventoryComputedDisplay
    ) -> [InventoryMissingInput] {
        guard case .unavailable = display,
            let computed = item.computedValues.first(where: { $0.fieldId == field.id })
        else { return [] }
        let catalogueFields = source.inventoryProtocol2Catalogue()?.types.flatMap(\.fields) ?? []
        return InventoryMissingInputs.named(
            computed, of: item, fields: type.fields + catalogueFields
        ) { source.inventoryItem(id: $0)?.name }
    }

    private func display(of field: InventoryCatalogueField) -> InventoryComputedDisplay {
        if let computed = item.computedValues.first(where: { $0.fieldId == field.id }) {
            return computed.display(in: item, activeCatalogueRevision: activeCatalogueRevision) {
                source.inventoryItem(id: $0)?.revision
            }
        }
        let localOverride = item.fieldValues.first {
            $0.fieldId == field.id && $0.source == .override
        }
        if case .value(let values)? = localOverride?.state, let value = values.first {
            return .overridden(value)
        }
        return .outOfDate
    }

    private func text(
        for field: InventoryCatalogueField, display: InventoryComputedDisplay,
        missing: [InventoryMissingInput]
    ) -> (String, InventoryDetailFieldSource) {
        switch display {
        case .value(let value):
            return (valueText(value, field: field), .calculated)
        case .overridden(let value):
            return (valueText(value, field: field), .overridden)
        case .unavailable(let reason, _):
            return (
                InventoryProtocol2Display.unavailable(reason: reason, missing: missing),
                .unavailable
            )
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
}
