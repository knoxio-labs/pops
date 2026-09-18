import AppCore

// The string each open vocabulary is stored as. They are the wire strings, so a
// value this build does not recognise is stored exactly as it arrived and read
// back through the same `init(wire:)` that decoded it off the wire.

extension InventoryLifecycle {
    var storageValue: String {
        switch self {
        case .active: "active"
        case .retired: "retired"
        case .discarded: "discarded"
        case .lost: "lost"
        case .destroyed: "destroyed"
        case .unrecognised(let value): value
        }
    }
}

extension InventoryDiscardReason {
    var storageValue: String {
        switch self {
        case .donated: "donated"
        case .sold: "sold"
        case .usedUp: "used_up"
        case .broken: "broken"
        case .gaveAway: "gave_away"
        case .unrecognised(let value): value
        }
    }
}

extension InventoryEventKind {
    /// A case missing from `storedWireValues` is stored under its Swift name
    /// and so reads back as `.unrecognised`: the same degradation D10 gives an
    /// old build meeting a new event kind on the wire, rather than a crash.
    var storageValue: String {
        if case .unrecognised(let value) = self { return value }
        return Self.storageValues[self] ?? String(describing: self)
    }

    static let storedWireValues: [String] = [
        "created", "edited", "type_changed", "moved", "access_changed", "fullness_changed",
        "lifecycle_changed", "quantity_changed", "split", "code_changed", "photo_attached",
        "photo_removed", "photos_reordered", "deleted", "restored", "location_created",
        "location_renamed", "location_moved", "location_deleted", "reverted", "migrated",
    ]

    private static let storageValues: [InventoryEventKind: String] = Dictionary(
        uniqueKeysWithValues: storedWireValues.map { (InventoryEventKind(wire: $0), $0) })
}

extension InventoryEntityKind {
    var storageValue: String {
        switch self {
        case .item: "item"
        case .location: "location"
        }
    }

    init?(storageValue: String) {
        switch storageValue {
        case "item": self = .item
        case "location": self = .location
        default: return nil
        }
    }
}

extension InventoryAccess {
    var storageValue: String {
        switch self {
        case .open: "open"
        case .closed: "closed"
        }
    }
}
