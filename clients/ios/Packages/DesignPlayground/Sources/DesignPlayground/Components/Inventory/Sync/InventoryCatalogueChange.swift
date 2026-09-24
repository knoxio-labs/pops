/// How one value in a queued change stands against the fields this phone has
/// now.
internal enum InventoryFieldFit: Hashable {
    case fits
    case archived
    /// The field is still there; the option the value picked is not.
    case optionRetired
    case replaced(by: String)
    case changedKind(to: String)
    case nowRequired
    /// Named by a newer catalogue that has not reached this phone.
    case notOnPhone

    internal var symbol: InventorySymbol {
        switch self {
        case .fits: .resolved
        case .archived, .optionRetired: .retired
        case .replaced, .changedKind: .replaced
        case .nowRequired: .required
        case .notOnPhone: .update
        }
    }

    /// The one word or two the row adds beside its mark, or nil when the mark
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
        }
    }

    internal var blocks: Bool { self != .fits }
}

/// One field of a queued change and the value it carried.
internal struct InventoryQueuedValue: Identifiable, Hashable {
    internal let field: String
    internal let value: String
    internal var fit: InventoryFieldFit = .fits

    internal var id: String { field }
}

/// What Retry does to a `catalogueChanged` repair on the phone as it is.
internal enum InventoryCatalogueRetry: Hashable {
    /// The change moves onto the current fields and is sent.
    case sends
    /// The change still names something the current fields no longer have.
    case refused(String)
    /// The fields the change needs have not reached this phone.
    case waitsForFields

    /// What the write-failure alert says when Retry does not send, or nil
    /// when it does.
    internal var refusal: String? {
        switch self {
        case .sends: nil
        case .refused(let reason): reason
        case .waitsForFields: "The new fields have not arrived yet. Try again after Sync."
        }
    }
}

/// A queued change that a newer catalogue left behind: what it was, the
/// values it carried, and what Retry would do now.
internal struct InventoryCatalogueChange: Hashable {
    /// The kind of change, as its section is titled.
    internal let title: String
    internal let values: [InventoryQueuedValue]
    internal let retry: InventoryCatalogueRetry
}

extension InventoryQueuedOperation {
    /// What the change does, and why it is held when it is.
    internal var caption: String {
        [detail, hold?.caption].compactMap(\.self).joined(separator: " · ")
    }
}

/// Why a queued change is still waiting rather than being sent.
internal enum InventoryQueueHold: Equatable {
    /// The server wants it authored against newer fields; the phone is
    /// fetching them and will move it across on its own.
    case newFields
    /// The newer fields need a newer app.
    case appUpdate
    /// An earlier change to the same record needs a repair first.
    case behindRepair

    internal var caption: String {
        switch self {
        case .newFields: "Waiting for new fields"
        case .appUpdate: "Needs an app update"
        case .behindRepair: "Waits on a repair"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .newFields: .refreshFields
        case .appUpdate: .appUpdate
        case .behindRepair: .held
        }
    }
}
