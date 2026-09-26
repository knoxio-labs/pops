import AppCore

/// One input an unavailable computed value is waiting on, named for display:
/// the field's label and the item it has no value on.
internal struct InventoryMissingInput: Hashable, Identifiable, Sendable {
    internal let id: String
    internal let field: String
    internal let item: String
    /// Whether the input is on the item that owns the computed field.
    internal let isOnOwnItem: Bool
    internal let reason: InventoryValueUnavailableReason?

    /// "Width · Box", and why when the value is not simply unset.
    internal var text: String {
        guard let detail = reason.flatMap(Self.detail) else { return "\(field) · \(item)" }
        return "\(field) · \(item) (\(detail))"
    }

    /// The word or two a reason adds beside its input, matching the terms the
    /// catalogue repair surface already settled on for the same states: "not
    /// here yet" for something a newer catalogue named that has not reached
    /// this phone (`InventoryFieldFit.notOnPhone`), and the plain word for
    /// what stops it for good.
    private static func detail(_ reason: InventoryValueUnavailableReason) -> String? {
        switch reason {
        case .missingDependency, .evaluationError: nil
        case .referenceUnresolved: "not here yet"
        case .referenceMissing: "missing"
        case .referenceDeleted: "deleted"
        }
    }
}

/// Names what an unavailable computed value lacks, for Item detail and the
/// item form.
internal enum InventoryMissingInputs {
    /// Every input `value` lacks, each field labelled from `fields` (field
    /// ids are unique within a catalogue) and each item by `itemName`. A value
    /// stored before the server listed its inputs names the one its
    /// `failedFieldId` does, on the last item its read reached. An evaluation
    /// error lacks no input.
    internal static func named(
        _ value: InventoryComputedValue, of item: InventoryItem,
        fields: [InventoryCatalogueField], itemName: (String) -> String?
    ) -> [InventoryMissingInput] {
        named(value, rootItemId: item.id, rootName: item.name, fields: fields, itemName: itemName)
    }

    /// Names an unavailable computed value's inputs against a root that need
    /// not be a saved item yet: the item form's draft, evaluated live from
    /// its current values before Create has ever run.
    internal static func named(
        _ value: InventoryComputedValue, rootItemId: String, rootName: String,
        fields: [InventoryCatalogueField], itemName: (String) -> String?
    ) -> [InventoryMissingInput] {
        let labels = Dictionary(
            fields.map { ($0.id, $0.label) }, uniquingKeysWith: { first, _ in first })
        var seen: Set<String> = []
        return inputs(of: value, rootItemId: rootItemId).compactMap { input in
            let id = "\(input.itemId):\(input.fieldId)"
            guard seen.insert(id).inserted else { return nil }
            let isOwn = input.itemId == rootItemId
            return InventoryMissingInput(
                id: id, field: labels[input.fieldId] ?? "Unknown field",
                item: isOwn ? rootName : itemName(input.itemId) ?? "Unknown item",
                isOnOwnItem: isOwn, reason: InventoryValueUnavailableReason(rawValue: input.reason))
        }
    }

    private static func inputs(of value: InventoryComputedValue, rootItemId: String)
        -> [InventoryExpressionMissingInput]
    {
        guard case .unavailable(let reason, let failedFieldId) = value.evaluation,
            reason != InventoryValueUnavailableReason.evaluationError.rawValue
        else { return [] }
        if !value.missingInputs.isEmpty { return value.missingInputs }
        return [
            InventoryExpressionMissingInput(
                reason: reason, fieldId: failedFieldId,
                itemId: value.traversedItemIds.last ?? rootItemId)
        ]
    }

    /// The inputs worth listing under the summary: none when the summary
    /// already names the only one, on the item itself.
    internal static func listed(_ missing: [InventoryMissingInput]) -> [InventoryMissingInput] {
        if missing.count == 1, missing[0].isOnOwnItem { return [] }
        return missing
    }
}

extension InventoryProtocol2Display {
    /// A computed field's unavailable reason: the one missing input by label
    /// (and item, when it is another), or how many there are. Shared by Item
    /// detail and the item form, the two places a computed value's
    /// unavailability is shown; ``InventoryMissingInputs/listed(_:)`` lists
    /// them under it.
    internal static func unavailable(reason: String, missing: [InventoryMissingInput]) -> String {
        guard let known = InventoryValueUnavailableReason(rawValue: reason) else {
            return "Unavailable"
        }
        let unset = missing.allSatisfy { $0.reason == .missingDependency }
        if missing.count > 1 {
            return unset
                ? "Unavailable until \(missing.count) values are set"
                : "Unavailable: \(missing.count) values are missing"
        }
        if let only = missing.first, unset {
            let place = only.isOnOwnItem ? "" : " on \(only.item)"
            return "Unavailable until \(only.field)\(place) is set"
        }
        return unavailable(known)
    }
}
