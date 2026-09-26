import AppCore

extension InventoryCommand {
    /// This command's field values, one entry per protocol-2 field it
    /// writes: `nil` values for an edit clearing a field become an empty
    /// array, matching what `carriesReferenceValue` and
    /// `referenceFieldValues` both need.
    private var protocol2FieldValues: [(fieldId: String, values: [InventoryPrimitiveValue])] {
        switch self {
        case .createProtocol2Item(let item):
            (item.values + item.overrides).map { ($0.fieldId, $0.values) }
        case .editProtocol2Item(_, _, let patches):
            patches.map { ($0.fieldId, $0.values ?? []) }
        case .changeProtocol2ItemType(_, _, _, let values):
            values.map { ($0.fieldId, $0.values) }
        default: []
        }
    }

    /// Whether this is a protocol-2 new item, edit or type change writing at
    /// least one reference value: the changes a stale reference repairs.
    var carriesReferenceValue: Bool {
        protocol2FieldValues.contains { _, values in
            values.contains { value in
                if case .reference = value { return true }
                return false
            }
        }
    }

    /// Every reference value this command carries, alongside the field it
    /// belongs to (POPS-4617): what Retry must re-check locally before
    /// resending a stale-reference repair unchanged.
    var referenceFieldValues: [(fieldId: String, value: InventoryReferenceValue)] {
        protocol2FieldValues.flatMap { fieldId, values in
            values.compactMap { value -> (fieldId: String, value: InventoryReferenceValue)? in
                guard case .reference(let reference) = value else { return nil }
                return (fieldId, reference)
            }
        }
    }
}
