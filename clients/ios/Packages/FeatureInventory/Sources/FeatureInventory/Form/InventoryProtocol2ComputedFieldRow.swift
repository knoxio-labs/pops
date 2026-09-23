import AppCore

/// One computed field's row in the item form: what it shows, and whether
/// setting or clearing an override is offered right now. Kept apart from the
/// SwiftUI row so the state it decides is a plain value, testable the way
/// ``InventoryComputedDetailLine`` is on Item detail.
internal struct InventoryProtocol2ComputedFieldRow {
    internal let field: InventoryCatalogueField
    /// The server's evaluation reconciled with this phone's own changes, nil
    /// when the field has never been evaluated (an item still being created).
    internal let display: InventoryComputedDisplay?
    /// Whether an override can be set or cleared right now: only once the
    /// item exists, since the reducer requires it.
    internal let overridesEnabled: Bool

    internal func text(
        referenceLabel: (InventoryReferenceValue) -> String?,
        dependencyLabel: (String) -> String?
    ) -> String {
        guard let display else { return "Not calculated yet" }
        switch display {
        case .value(let value), .overridden(let value):
            return InventoryProtocol2Display.text(
                for: [value], field: field, referenceLabel: referenceLabel)
        case .unavailable(let reason, let failedFieldId):
            return InventoryProtocol2Display.unavailable(
                reason: reason, failedFieldId: failedFieldId, dependencyLabel: dependencyLabel)
        case .outOfDate:
            return "Out of date"
        }
    }

    internal var caption: String? {
        switch display {
        case .value: "Calculated"
        case .overridden: "Overridden"
        case .unavailable, .outOfDate, nil: nil
        }
    }

    internal var isMuted: Bool {
        switch display {
        case .unavailable, .outOfDate, nil: true
        case .value, .overridden: false
        }
    }

    internal var isOverridden: Bool {
        if case .overridden = display { return true }
        return false
    }

    /// Offered only for a field the catalogue still allows overriding, not
    /// archived, and not already overridden — clearing comes first for one
    /// already overridden.
    internal var canStartOverride: Bool {
        overridesEnabled && field.allowOverride && field.archivedAt == nil && !isOverridden
    }

    internal var canClearOverride: Bool {
        overridesEnabled && isOverridden
    }
}
