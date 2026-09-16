/// Retrieval and unpacking, in the words ADR-001 already settled: pick up,
/// put back, move, close, discard.
///
/// The vocabulary types in ``InventoryVocabulary`` carry only what a row shows
/// today. `InventoryPlacement.inHand` remembers one previous placement as a
/// string, because that is all ADR-001 asks a row to display. Retrieval needs
/// to know more about that one step back than a row does: whether it still
/// exists, whether it might have moved since, and whether the container it
/// was in was closed. Those facts live here, beside the item rather than
/// inside the shared vocabulary, so POPS-3987 does not reopen a decision
/// POPS-3979 already made about what ``InventoryPlacement`` means.
internal enum InventoryPreviousPlacementStatus: Equatable {
    /// The previous placement is exactly where it was left.
    case current
    /// It still exists, but something else may have happened there since.
    /// Shown so "Put back" does not read as more certain than it is.
    case stale
    /// The location or container it names no longer exists.
    case deleted
}

/// An in-hand item, with what retrieval needs to know about where it came
/// from that a plain row does not carry.
internal struct InventoryRetrievalItem: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let previousStatus: InventoryPreviousPlacementStatus
    /// Whether the container being put back into was closed when the item was
    /// picked up. Put back still succeeds: ADR-001's actions do not gate on
    /// this. The card says so anyway, because reopening it is what actually
    /// happens.
    internal let previousWasClosedContainer: Bool

    internal var id: String { item.id }

    internal init(
        _ item: InventoryFoundationItem,
        previousStatus: InventoryPreviousPlacementStatus = .current,
        previousWasClosedContainer: Bool = false
    ) {
        self.item = item
        self.previousStatus = previousStatus
        self.previousWasClosedContainer = previousWasClosedContainer
    }

    /// The text a previous-placement card shows below the destination name.
    internal var statusNote: String? {
        switch previousStatus {
        case .current: previousWasClosedContainer ? "Closed. Putting it back reopens it." : nil
        case .stale: "Last known placement. It may have moved since."
        case .deleted: "This place no longer exists. Choose somewhere else."
        }
    }
}

/// What a person can do with an in-hand item, worked out from what is known
/// about where it came from: the logic a put-back button and a move sheet
/// both need, kept out of the view so it can be tested without one.
internal enum InventoryRetrieval {
    /// Whether "Put back" is the previous placement rather than a fresh
    /// choice. False only when there is nowhere recorded to go back to, or
    /// that place is gone. A deleted previous placement still shows the
    /// card, so the reader can see why it disappeared, but has no button.
    internal static func canPutBack(_ retrieval: InventoryRetrievalItem) -> Bool {
        guard case .inHand(let previous?) = retrieval.item.placement else { return false }
        return !previous.isEmpty && retrieval.previousStatus != .deleted
    }

    /// The item as it reads after being put back: placed directly at its
    /// previous destination, no longer carrying one.
    ///
    /// Only meaningful when ``canPutBack`` is true; called otherwise it
    /// leaves the item where it already is, because there is nothing to put
    /// it back to.
    internal static func putBack(_ retrieval: InventoryRetrievalItem) -> InventoryFoundationItem {
        guard case .inHand(let previous?) = retrieval.item.placement, canPutBack(retrieval) else {
            return retrieval.item
        }
        var updated = retrieval.item
        updated.placement = .direct(location: previous)
        return updated
    }

    /// The item as it reads once picked up, remembering where it was so a
    /// later put-back has somewhere to go. Picking up an item already in hand
    /// changes nothing, there is no second "previous" to remember.
    internal static func pickUp(_ item: InventoryFoundationItem) -> InventoryFoundationItem {
        guard !item.placement.isInHand else { return item }
        var updated = item
        updated.placement = .inHand(
            previous: item.placement.crumbs.last ?? item.placement.effectiveLocation)
        return updated
    }

    /// Whether a quantity can be moved as a whole in one retrieval action.
    /// Moving *part* of a group is split (ADR-001), not a move, and a
    /// retrieval screen that let a drag take "some of" a group would be
    /// inventing a second way to do what Split already does.
    internal static func canMoveWhole(_ item: InventoryFoundationItem) -> Bool {
        item.quantity.count <= 1
    }
}

/// What "split" (ADR-001) does to a quantity: takes part of a group into a
/// new, independent record. Lives beside retrieval rather than in
/// ``InventoryAction`` because that type only decides which verbs an item
/// offers. The arithmetic behind the verb belongs with the other retrieval
/// logic this file already holds.
internal enum InventoryQuantitySplitError: Error, Equatable {
    /// Nothing to take, or the whole group: either leaves one side with
    /// zero, which is not a split. It is the action that already exists for
    /// "none left".
    case amountOutOfRange
}

internal enum InventoryQuantitySplit {
    /// - Returns: the quantity left behind and the quantity split off, each a
    ///   real, independent record from this point on.
    internal static func split(
        _ quantity: InventoryQuantity, taking amount: Int
    ) throws -> (remaining: InventoryQuantity, split: InventoryQuantity) {
        guard amount > 0, amount < quantity.count else {
            throw InventoryQuantitySplitError.amountOutOfRange
        }
        return (InventoryQuantity(count: quantity.count - amount), InventoryQuantity(count: amount))
    }
}

/// One container's unpacking, and how far through it the person is.
internal struct InventoryUnpackingProgress: Equatable {
    internal let containerName: String
    internal let totalItems: Int
    internal let placedItems: Int
    /// Out of the box but not yet anywhere. The hand is not a destination, so
    /// these count against completion rather than toward it.
    internal let inHandItems: Int

    internal init(
        containerName: String, totalItems: Int, placedItems: Int, inHandItems: Int = 0
    ) {
        self.containerName = containerName
        self.totalItems = totalItems
        self.placedItems = placedItems
        self.inHandItems = inHandItems
    }

    /// Still inside the container.
    internal var remainingItems: Int { max(totalItems - placedItems - inHandItems, 0) }
    /// Every item that started inside now has somewhere to be.
    internal var isComplete: Bool { remainingItems == 0 && inHandItems == 0 }

    internal var summary: String {
        switch (remainingItems, inHandItems) {
        case (0, 0): "Everything placed"
        case (0, let inHand): "\(containerName) is empty, \(inHand) still in hand"
        case (let left, 0): "\(left) of \(totalItems) still in \(containerName)"
        case (let left, let inHand):
            "\(left) of \(totalItems) still in \(containerName), \(inHand) in hand"
        }
    }
}

/// What closing a container mid-unpack, or emptying it, actually resolves.
/// Kept separate from the view so "close creates no artificial placement
/// validation" (POPS-3987's done criterion) is a fact the tests can hold the
/// implementation to, not just a sentence in the ticket.
internal enum InventoryUnpackingOutcome: Equatable {
    /// Some items are still inside. Closing it is always allowed: ADR-001
    /// never made "closed" mean "empty".
    case closedPartial(remaining: Int)
    /// Nothing is inside any more. A choice about the box itself follows.
    case empty
}

internal enum InventoryEmptyContainerChoice: String, CaseIterable, Identifiable {
    case keepForStorage = "keep"
    case retire = "retire"

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .keepForStorage: "Keep it empty, for storage"
        case .retire: "Retire it"
        }
    }

    internal var detail: String {
        switch self {
        case .keepForStorage: "Stays in the catalogue, ready for the next thing put in it."
        case .retire: "Stops counting as a container. Can be restored, like any retirement."
        }
    }
}
