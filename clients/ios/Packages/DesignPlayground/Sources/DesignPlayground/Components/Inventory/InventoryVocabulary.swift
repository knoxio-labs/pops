/// The Inventory vocabulary, as types.
///
/// Every word here is defined in `pillars/inventory/docs/architecture/
/// adr-001-domain-vocabulary.md`, and these types exist so a component cannot
/// use one of those words to mean something else. Nothing here describes
/// storage: a placement is what a person would say about where a thing is,
/// not how a database would record it.

/// Where an item is. Exactly one of three, per the ADR.
internal enum InventoryPlacement: Equatable {
    /// Sitting in a location, with no container between.
    case direct(location: String)
    /// Inside a container. `containers` runs outermost first, so the last one
    /// is the one the item is actually in. `location` is where the outermost
    /// container sits, and is nil when that container is itself unplaced.
    case contained(location: String?, containers: [String])
    /// Picked up and not yet put anywhere. `previous` is one step back, not a
    /// history.
    case inHand(previous: String?)

    /// The location found by following containers outward. Nil when the chain
    /// ends in someone's hand rather than in a room, which is a real state,
    /// not missing data, and is shown as such.
    internal var effectiveLocation: String? {
        switch self {
        case .direct(let location): location
        case .contained(let location, _): location
        case .inHand: nil
        }
    }

    /// The container the item is directly inside, if any.
    internal var containingItem: String? {
        guard case .contained(_, let containers) = self else { return nil }
        return containers.last
    }

    internal var isInHand: Bool {
        if case .inHand = self { return true }
        return false
    }

    /// The path a reader follows from the room inward, ending at the thing
    /// that holds this item. What the breadcrumb draws.
    internal var crumbs: [String] {
        switch self {
        case .direct(let location):
            [location]
        case .contained(let location, let containers):
            (location.map { [$0] } ?? []) + containers
        case .inHand:
            []
        }
    }
}

/// Whether a container can take more items. Only containers have one.
internal enum InventoryAccess: Equatable {
    case open
    case closed
    /// Closed, and not to be opened until it arrives. Only reachable while the
    /// close-or-seal question is open and the style offers sealing; reopening
    /// one asks first, which is the whole difference from closed.
    case sealed
}

/// Whether an item still exists and counts. Independent of access: a closed
/// box is not a retired one.
internal enum InventoryLifecycle: Equatable, CaseIterable {
    case active
    case retired
    case discarded
    case lost
    case destroyed

    /// Whether the item is part of "what I have". Only active items are.
    internal var countsTowardTotals: Bool { self == .active }

    /// Whether the state can be walked back from the phone. Destroyed is a
    /// fact about the world rather than a decision about the record, so
    /// nothing restores it; the others were choices, and choices can be
    /// undone.
    internal var isRestorable: Bool {
        switch self {
        case .active, .destroyed: false
        case .retired, .discarded, .lost: true
        }
    }
}

/// What the phone knows about a change relative to the server.
///
/// Two orderings live here and must not be confused. The *progress* order is
/// the one a change moves through: saved, queued, synchronizing, synchronized.
/// The *prominence* order is how loudly to show it, and there synchronized and
/// saved are both silent, saved is where the phone spends most of its time,
/// and it must not look like a problem.
internal enum InventorySync: Equatable, CaseIterable {
    case saved
    case queued
    case synchronizing
    case synchronized
    case stale
    case needsAttention

    internal var prominence: InventorySyncProminence {
        switch self {
        case .saved, .synchronized: .silent
        case .queued, .synchronizing: .quiet
        case .stale: .visible
        case .needsAttention: .urgent
        }
    }

    internal var label: String {
        switch self {
        case .saved: "Saved"
        case .queued: "Waiting to sync"
        case .synchronizing: "Syncing"
        case .synchronized: "Synced"
        case .stale: "May be out of date"
        case .needsAttention: "Needs attention"
        }
    }
}

internal enum InventorySyncProminence: Int, Comparable {
    case silent
    case quiet
    case visible
    case urgent

    internal static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// How many identical things one record stands for, all in one placement.
internal struct InventoryQuantity: Equatable {
    internal let count: Int

    /// What a row shows. A single thing shows nothing, a "1" on every row is
    /// noise, and an exhausted group says so rather than showing a zero that
    /// reads like an error.
    internal var badge: String? {
        switch count {
        case 1: nil
        case ..<1: "None left"
        default: "×\(count)"
        }
    }
}
