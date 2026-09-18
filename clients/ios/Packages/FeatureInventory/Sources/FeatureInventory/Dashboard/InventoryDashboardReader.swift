import AppCore

extension InventoryDashboard {
    /// The query the dashboard observes: every section, read against one
    /// state.
    internal static func query(recentLimit: Int) -> InventoryQuery<InventoryDashboard> {
        InventoryQuery { InventoryDashboard(reading: $0, recentLimit: recentLimit) }
    }

    internal init(reading source: any InventoryQuerySource, recentLimit: Int) {
        let status = source.inventoryReplicaStatus()
        let ledger = source.inventorySyncLedger()
        let places = InventoryPlaceNames(source: source)
        isFirstRun = status == .empty
        sync = InventoryDashboardSync.derive(status: status, ledger: ledger)
        counts = source.inventoryCounts()
        openContainers = source.inventoryOpenContainers().map { container in
            OpenContainer(
                id: container.id, name: container.name,
                place: places.effectiveLocation(of: container.placement),
                itemCount: source.inventoryContents(ofContainer: container.id).count,
                updatedAt: container.updatedAt)
        }
        inHand = InHandItem.all(
            reading: source, places: places,
            rowSync: InventoryRowSync(status: status, ledger: ledger))
        recentWork = source.inventoryRecentEvents(limit: recentLimit).map {
            InventoryActivityLine.activity(for: $0, source: source, places: places)
        }
    }
}

extension InventoryDashboard.InHandItem {
    /// Every in-hand row, read against one state: the dashboard's section
    /// and the In hand page list exactly the same rows.
    internal static func all(
        reading source: any InventoryQuerySource, places: InventoryPlaceNames,
        rowSync: InventoryRowSync
    ) -> [Self] {
        source.inventoryInHand().map { item in
            Self(
                id: item.id, name: item.name, access: item.containment?.access,
                quantity: item.quantity, sync: rowSync.sync(of: item.id),
                photo: item.photos.first?.sha256,
                previous: places.previousPlace(item.previousPlacement))
        }
    }
}

/// Names for placements, read from the same state as the rest of the
/// dashboard.
internal struct InventoryPlaceNames {
    /// D2's cycle guard, applied to the walk on this side too: a chain longer
    /// than the server would ever store is corrupt data, and stopping beats
    /// spinning.
    private static let maximumDepth = 32

    internal let source: any InventoryQuerySource

    /// The name a placement shows as where something is now: the location
    /// or container it sits in directly.
    internal func immediate(_ placement: InventoryPlacement) -> String? {
        switch placement {
        case .location(let id): liveLocation(id)?.name
        case .container(let id): liveItem(id)?.name
        case .hand: nil
        }
    }

    /// The location a placement resolves to once every container is walked
    /// outward, or nil when the chain ends in someone's hand.
    internal func effectiveLocation(of placement: InventoryPlacement) -> String? {
        walk(placement).location
    }

    /// Where a placement is, as a reader follows it from the room inward:
    /// the effective location when there is one, then every container from
    /// outermost to innermost.
    internal func path(of placement: InventoryPlacement) -> [String] {
        let walked = walk(placement)
        return (walked.location.map { [$0] } ?? []) + walked.containers.reversed()
    }

    /// Follows containers outward, collecting their names innermost first,
    /// to the location that ends the chain; nil when it ends in a hand, at a
    /// gone container, or past the depth guard.
    private func walk(
        _ placement: InventoryPlacement
    ) -> (containers: [String], location: String?) {
        var containers: [String] = []
        var current = placement
        for _ in 0..<Self.maximumDepth {
            switch current {
            case .location(let id): return (containers, liveLocation(id)?.name)
            case .hand: return (containers, nil)
            case .container(let id):
                guard let container = liveItem(id) else { return (containers, nil) }
                containers.append(container.name)
                current = container.placement
            }
        }
        return (containers, nil)
    }

    /// What an in-hand row says about where it came from. A remembered place
    /// that no longer exists reads as deleted, whether the server tombstoned
    /// the reference or the row it points at is gone.
    internal func previousPlace(_ previous: InventoryPreviousPlacement?) -> InventoryPreviousPlace {
        switch previous {
        case nil:
            return .nowhere
        case .tombstoned:
            return .deleted
        case .location(let id):
            guard let location = liveLocation(id) else { return .deleted }
            return .place(name: location.name, placement: .location(id))
        case .container(let id):
            guard let container = liveItem(id) else { return .deleted }
            return .place(name: container.name, placement: .container(id))
        }
    }

    private func liveLocation(_ id: InventoryLocation.ID) -> InventoryLocation? {
        source.inventoryLocation(id: id).flatMap { $0.isDeleted ? nil : $0 }
    }

    private func liveItem(_ id: InventoryItem.ID) -> InventoryItem? {
        source.inventoryItem(id: id).flatMap { $0.isDeleted ? nil : $0 }
    }
}

/// A row's `InventorySync`, derived from the ledger and the replica the way
/// ADR-002's sync state machine states it.
internal struct InventoryRowSync {
    private let repaired: Set<String>
    private let sending: Set<String>
    private let waiting: Set<String>
    private let isStale: Bool

    internal init(status: InventoryReplicaStatus, ledger: InventoryReplicaSyncLedger) {
        repaired = Set(ledger.repairs.map(\.entityId))
        sending = Set(ledger.waiting.filter { $0.progress != nil }.map(\.receipt.entityId))
        waiting = Set(ledger.waiting.map(\.receipt.entityId))
        if case .stale = status { isStale = true } else { isStale = false }
    }

    /// The ledger does not say whether the drain has attempted a waiting
    /// change yet, so every waiting change reads as queued rather than
    /// saved. Both are quiet; only the word differs.
    internal func sync(of id: String) -> InventorySync {
        InventorySync.derive(
            from: InventorySync.RowFacts(
                hasOpenRepair: repaired.contains(id),
                isSynchronizing: sending.contains(id),
                isQueued: waiting.contains(id),
                isSaved: false,
                replicaIsStale: isStale))
    }
}
