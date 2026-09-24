import AppCore

/// How one value in a queued change stands against the fields this phone has
/// now, as the approved `inventory/catalogue-repair` design marks it.
internal enum InventoryFieldFit: Hashable, Sendable {
    case fits
    case archived
    /// The field is still there; the option the value picked is not.
    case optionRetired
    case replaced(by: String)
    case changedKind(to: String)
    case nowRequired
    /// Named by a newer catalogue that has not reached this phone.
    case notOnPhone
    /// A reference to a record that is no longer in Inventory.
    case recordGone
    /// A reference to a record whose type the field no longer allows.
    case recordNotAllowed

    internal var symbol: InventorySymbol {
        switch self {
        case .fits: .resolved
        case .archived, .optionRetired: .retired
        case .replaced, .changedKind: .replaced
        case .nowRequired: .required
        case .notOnPhone: .newerFields
        case .recordGone: .lost
        case .recordNotAllowed: .unavailable
        }
    }

    /// The word or two the row adds beside its mark, or nil when the mark
    /// says it all.
    internal var caption: String? {
        switch self {
        case .fits: nil
        case .archived: "Archived"
        case .optionRetired: "Retired"
        case .replaced(let name): "Now \(name)"
        case .changedKind(let kind): "Now \(kind)"
        case .nowRequired: "Required"
        case .notOnPhone: "Not here yet"
        case .recordGone: "Gone"
        case .recordNotAllowed: "Not allowed"
        }
    }

    internal var blocks: Bool { self != .fits }

    /// Whether the value names a record the field can no longer take.
    internal var isStaleReference: Bool { self == .recordGone || self == .recordNotAllowed }
}

/// One field of a queued change and the value it carried.
internal struct InventoryQueuedValue: Identifiable, Hashable, Sendable {
    /// The field's id, or `type` for the type row.
    internal let id: String
    internal let field: String
    internal let value: String
    internal let fit: InventoryFieldFit
}

/// Which commit a catalogue repair leads with.
internal enum InventoryCatalogueRepairAction: Hashable, Sendable {
    /// Reopen the item form against the current fields, queued values
    /// filled in.
    case editItem
    /// Send the change again unedited.
    case retry
}

/// A `catalogueChanged` repair read against this phone's current fields:
/// what the change was, each value's standing, and what the screen offers.
internal struct InventoryCatalogueRepairDetail: Hashable, Sendable {
    /// The kind of change, as its section is titled.
    internal let title: String
    /// The one line the repair states, from the first thing in the way.
    internal let problem: String
    internal let values: [InventoryQueuedValue]
    /// The fields changed since the repair opened.
    internal let definitionsChanged: Bool
    /// What Retry refused says, from the first value still in the way.
    internal let refusal: String?

    internal var isBlocked: Bool { values.contains { $0.fit.blocks } }

    /// Edit item while something still blocks the change, and while nothing
    /// has changed that could make sending it again turn out differently.
    internal var leadingAction: InventoryCatalogueRepairAction {
        isBlocked || !definitionsChanged ? .editItem : .retry
    }

    /// Retry only once the fields changed since the repair opened.
    internal var offersRetry: Bool { definitionsChanged }
}
