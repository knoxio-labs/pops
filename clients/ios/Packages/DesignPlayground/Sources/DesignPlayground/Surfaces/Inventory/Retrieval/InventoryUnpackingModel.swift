/// One item still inside a container being unpacked, and the choice of where
/// it goes next.
internal struct InventoryUnpackingLot: Identifiable, Equatable {
    internal let item: InventoryFoundationItem

    internal var id: String { item.id }
}

/// A container mid-unpack: what is left inside, what has already left, and
/// which destinations were created while building the new home.
internal struct InventoryUnpackingState: Equatable {
    internal let containerName: String
    internal var remaining: [InventoryUnpackingLot]
    internal var placedCount: Int
    internal let totalItems: Int
    internal var createdDestinations: [String]

    internal init(
        containerName: String,
        remaining: [InventoryFoundationItem],
        placedCount: Int = 0,
        createdDestinations: [String] = []
    ) {
        self.containerName = containerName
        self.remaining = remaining.map { InventoryUnpackingLot(item: $0) }
        self.placedCount = placedCount
        self.totalItems = placedCount + remaining.count
        self.createdDestinations = createdDestinations
    }

    internal var progress: InventoryUnpackingProgress {
        InventoryUnpackingProgress(
            containerName: containerName, totalItems: totalItems, placedItems: placedCount)
    }

    /// Sends every currently selected lot to `destination`, or a single one
    /// under single-item selection. Whole groups only: a quantity greater
    /// than one leaves with all of it, same rule as retrieval (see
    /// ``InventoryRetrieval/canMoveWhole``).
    internal mutating func place(_ ids: Set<String>, at destination: String) {
        let moving = remaining.filter { ids.contains($0.id) }
        guard !moving.isEmpty else { return }
        remaining.removeAll { ids.contains($0.id) }
        placedCount += moving.count
        if !createdDestinations.contains(destination) {
            createdDestinations.append(destination)
        }
    }

    /// Closing never checks whether the box is empty. ADR-001's "close" is
    /// stopping a container accepting items, not a claim about what is
    /// inside it: the done criterion this type exists to keep true.
    internal var closeOutcome: InventoryUnpackingOutcome {
        remaining.isEmpty ? .empty : .closedPartial(remaining: remaining.count)
    }
}
