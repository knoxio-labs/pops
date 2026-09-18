/// Something the More menu asks Item detail to do to the item's lifecycle.
internal enum InventoryLifecycleCommand: Equatable {
    case discard(InventoryDiscardReason?)
    case markLost
    case retire
    case restore
    case destroy
    case split
    case changeQuantity
}

/// One item's lifecycle as Item detail acts on it.
///
/// Every reversible command lands at once and hands back the undo offer the
/// capsule shows; Undo returns exactly the state before it. Destroy is the one
/// command with no offer, because it is confirmed first and nothing restores
/// it (ADR-001).
internal struct InventoryLifecycleRecord: Equatable {
    private struct Snapshot: Equatable {
        let item: InventoryFoundationItem
        let change: InventoryLifecycleChange?
    }

    internal private(set) var item: InventoryFoundationItem
    internal private(set) var change: InventoryLifecycleChange?
    private var before: [String: Snapshot] = [:]

    internal init(item: InventoryFoundationItem, change: InventoryLifecycleChange? = nil) {
        self.item = item
        self.change = item.lifecycle == .active ? nil : change
    }

    /// Discards the whole record, a group included: there is no partial
    /// discard, a group is split or renumbered first.
    internal mutating func discard(
        _ reason: InventoryDiscardReason?, when: String = "Today"
    ) -> InventoryUndoOffer? {
        remove(.discarded, reason: reason, when: when, offer: "Discarded")
    }

    internal mutating func markLost(when: String = "Today") -> InventoryUndoOffer? {
        remove(.lost, reason: nil, when: when, offer: "Marked lost")
    }

    internal mutating func retire(when: String = "Today") -> InventoryUndoOffer? {
        remove(.retired, reason: nil, when: when, offer: "Retired")
    }

    internal mutating func restore() -> InventoryUndoOffer? {
        guard item.lifecycle.isRestorable else { return nil }
        return apply(InventoryUndoOffer(message: "Restored", symbol: .restore)) {
            $0.item.lifecycle = .active
            $0.change = nil
        }
    }

    internal mutating func destroy(when: String = "Today") {
        guard item.lifecycle != .destroyed else { return }
        item.lifecycle = .destroyed
        change = InventoryLifecycleChange(lifecycle: .destroyed, when: when)
        before = [:]
    }

    /// Moves `count` of a group into a record of its own, leaving the rest
    /// here. At least one has to go and at least one has to stay.
    internal mutating func split(off count: Int) -> InventoryUndoOffer? {
        guard item.lifecycle == .active, (1..<item.quantity.count).contains(count) else {
            return nil
        }
        let remaining = item.quantity.count - count
        return apply(InventoryUndoOffer(message: "Split off \(count)", symbol: .split)) {
            $0.item = $0.item.withQuantity(remaining)
        }
    }

    internal mutating func renumber(to count: Int) -> InventoryUndoOffer? {
        guard item.lifecycle == .active, count >= 1, count != item.quantity.count else {
            return nil
        }
        return apply(InventoryUndoOffer(message: "Quantity \(count)", symbol: .reduceQuantity)) {
            $0.item = $0.item.withQuantity(count)
        }
    }

    /// Runs one of the commands that act at once, and returns its offer.
    /// Destroy, Split and Change quantity ask first, so they return nil here
    /// and change nothing.
    internal mutating func perform(_ command: InventoryLifecycleCommand) -> InventoryUndoOffer? {
        switch command {
        case .discard(let reason): discard(reason)
        case .markLost: markLost()
        case .retire: retire()
        case .restore: restore()
        case .destroy, .split, .changeQuantity: nil
        }
    }

    internal mutating func undo(_ offer: InventoryUndoOffer) {
        guard let snapshot = before.removeValue(forKey: offer.id) else { return }
        item = snapshot.item
        change = snapshot.change
    }

    private mutating func remove(
        _ lifecycle: InventoryLifecycle, reason: InventoryDiscardReason?, when: String,
        offer message: String
    ) -> InventoryUndoOffer? {
        guard item.lifecycle == .active else { return nil }
        return apply(InventoryUndoOffer(message: message, symbol: lifecycle.symbol)) {
            $0.item.lifecycle = lifecycle
            $0.change = InventoryLifecycleChange(lifecycle: lifecycle, when: when, reason: reason)
        }
    }

    private mutating func apply(
        _ offer: InventoryUndoOffer, _ transform: (inout Self) -> Void
    ) -> InventoryUndoOffer {
        before[offer.id] = Snapshot(item: item, change: change)
        transform(&self)
        return offer
    }
}

extension InventoryFoundationItem {
    fileprivate func withQuantity(_ count: Int) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: name, typeName: typeName, code: code, quantity: count,
            placement: placement, access: access, lifecycle: lifecycle, sync: sync)
    }
}
