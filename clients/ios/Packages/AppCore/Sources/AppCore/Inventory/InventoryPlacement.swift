/// Where an item is, in the two shapes the domain needs.
///
/// `InventoryPlacement` is the row itself, ADR-002 D2: exactly one of three,
/// each carrying the reference the others forbid. It is what a command reads
/// and writes, and it is all a single row ever states about itself — a
/// container's own placement says nothing about what is inside it.
///
/// `InventoryPlacementTrail` is what a query hands back after walking the
/// chain a placement's `container` case points into (D2: "the same walk on
/// the phone"). It is lifted from the design playground's
/// `InventoryPlacement`, kept under a different name because that name now
/// belongs to the row it is built from.
public enum InventoryPlacement: Hashable, Sendable {
    /// Sitting in a location, with no container between.
    case location(InventoryLocation.ID)
    /// Inside another item that grants containment.
    case container(InventoryItem.ID)
    /// Picked up and not yet put anywhere.
    case hand
}

/// One step back from `hand`, remembered with no foreign key (D2): the
/// referenced location or container may since have been tombstoned, which is
/// the approved "Previous place deleted" state rather than a decoding error.
public enum InventoryPreviousPlacement: Hashable, Sendable {
    case location(InventoryLocation.ID)
    case container(InventoryItem.ID)
    /// The place remembered no longer exists.
    case tombstoned
}

/// A placement resolved by walking `container` references outward to the
/// location, if any, that ends the chain.
///
/// The path a reader follows from the room inward, ending at the thing that
/// holds this item, lives in `crumbs`: the effective location first, then
/// every container from outermost to innermost. `effectiveLocation` is nil
/// exactly when the chain ends in someone's hand rather than in a room, which
/// D2 treats as a real state, not missing data.
public enum InventoryPlacementTrail: Hashable, Sendable {
    /// Sitting in a location, with no container between.
    case direct(location: InventoryLocation.ID)
    /// Inside one or more nested containers. `containers` runs outermost
    /// first, so the last one is the one the item is actually in. `location`
    /// is where the outermost container sits, and is nil when that container
    /// is itself unplaced.
    case contained(location: InventoryLocation.ID?, containers: [InventoryItem.ID])
    /// Picked up and not yet put anywhere.
    case inHand(previous: InventoryPreviousPlacement?)

    public var effectiveLocation: InventoryLocation.ID? {
        switch self {
        case .direct(let location): location
        case .contained(let location, _): location
        case .inHand: nil
        }
    }

    /// The container the item is directly inside, if any.
    public var containingItem: InventoryItem.ID? {
        guard case .contained(_, let containers) = self else { return nil }
        return containers.last
    }

    public var isInHand: Bool {
        if case .inHand = self { return true }
        return false
    }

    /// The location first, then every container from outermost to innermost.
    /// Location and item ids share `String` as their raw form, so the
    /// sequence a reader walks can live in one array.
    public var crumbs: [String] {
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
