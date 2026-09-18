/// Why an item was discarded. Recorded on the history event and nowhere
/// else: the badge stays the lifecycle word (ADR-001's closed vocabulary), so
/// a donated jacket reads Discarded wherever it is listed.
internal enum InventoryDiscardReason: String, CaseIterable, Hashable, Identifiable {
    case donated
    case sold
    case usedUp
    case broken
    case gaveAway

    internal var id: String { rawValue }

    internal var label: String {
        switch self {
        case .donated: "Donated"
        case .sold: "Sold"
        case .usedUp: "Used up"
        case .broken: "Broken"
        case .gaveAway: "Gave away"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .donated: .donated
        case .sold: .sold
        case .usedUp: .consumed
        case .broken: .broken
        case .gaveAway: .gaveAway
        }
    }
}

extension InventoryLifecycle {
    /// The badge's word, and the verb the history and the notice use.
    internal var label: String {
        switch self {
        case .active: "Active"
        case .retired: "Retired"
        case .discarded: "Discarded"
        case .lost: "Lost"
        case .destroyed: "Destroyed"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .active: .item
        case .retired: .retired
        case .discarded: .discard
        case .lost: .lost
        case .destroyed: .destroyed
        }
    }
}

/// When an item left "what I have", and why when a discard said.
internal struct InventoryLifecycleChange: Equatable {
    internal let lifecycle: InventoryLifecycle
    internal let when: String
    internal var reason: InventoryDiscardReason?

    /// The inactive page's one line: "Discarded 3 Sep · Donated".
    internal var notice: String {
        let head = "\(lifecycle.label) \(when)"
        guard let reason else { return head }
        return "\(head) · \(reason.label)"
    }
}

/// What kind of thing happened, which is what the History page filters by.
internal enum InventoryHistoryKind: String, CaseIterable, Hashable, Identifiable {
    case move
    case lifecycle
    case edit

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .move: "Moves"
        case .lifecycle: "Lifecycle"
        case .edit: "Edits"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .move: .move
        case .lifecycle: .restore
        case .edit: .edit
        }
    }
}
