internal enum InventoryItemPageFiltering {
    static func matches(
        _ item: InventoryItem, filter: InventoryItemPageFilter, source: any InventoryQuerySource
    ) -> Bool {
        isVisible(item, filter: filter)
            && matchesExclusions(item, filter: filter)
            && matchesPlacement(item, filter: filter)
            && matchesAccess(item, filter: filter)
            && matchesDetails(item, filter: filter, source: source)
            && matchesSync(item, filter: filter, source: source)
    }

    private static func isVisible(_ item: InventoryItem, filter: InventoryItemPageFilter) -> Bool {
        !item.isDeleted && (filter.includeInactive || item.lifecycle == .active)
    }

    private static func matchesExclusions(
        _ item: InventoryItem, filter: InventoryItemPageFilter
    ) -> Bool {
        (!filter.excludeContainers || !item.isContainer)
            && (!filter.excludeContained || item.containment == nil)
            && !filter.excludingIDs.contains(item.id)
            && (filter.excludingPlacement.map { item.placement != $0 } ?? true)
    }

    private static func matchesPlacement(
        _ item: InventoryItem, filter: InventoryItemPageFilter
    ) -> Bool {
        return switch filter.placement {
        case .any: true
        case .hand: item.placement == .hand
        case .location:
            if case .location = item.placement { true } else { false }
        case .container:
            if case .container = item.placement { true } else { false }
        }
    }

    private static func matchesAccess(
        _ item: InventoryItem, filter: InventoryItemPageFilter
    ) -> Bool {
        return switch filter.access {
        case .any: true
        case .open: item.containment?.access == .open
        case .closed: item.containment?.access == .closed
        }
    }

    private static func matchesDetails(
        _ item: InventoryItem, filter: InventoryItemPageFilter, source: any InventoryQuerySource
    ) -> Bool {
        let matchesType =
            filter.typeKey.map { typeKeys(for: item, source: source).contains($0) } ?? true
        let matchesQuantity = !filter.quantityGreaterThanOne || item.quantity.count > 1
        let matchesMissing: Bool
        switch filter.missing {
        case .none: matchesMissing = true
        case .type: matchesMissing = typeKeys(for: item, source: source).isEmpty
        case .code: matchesMissing = item.code == nil
        case .photo: matchesMissing = item.photos.isEmpty
        }
        return matchesType && matchesQuantity && matchesMissing
    }

    private static func matchesSync(
        _ item: InventoryItem, filter: InventoryItemPageFilter, source: any InventoryQuerySource
    ) -> Bool {
        let state = syncState(of: item.id, source: source)
        return switch filter.sync {
        case .any: true
        case .waiting: state == .queued || state == .saved || state == .synchronizing
        case .stale: state == .stale
        case .needsAttention: state == .needsAttention
        }
    }

    static func matches(_ event: InventoryEvent, filter: InventoryEventPageFilter) -> Bool {
        return switch filter {
        case .any: true
        case .moves: event.kind == .moved
        case .lifecycle:
            event.kind == .lifecycleChanged || event.kind == .deleted || event.kind == .restored
        case .lifecycleChanges: event.kind == .lifecycleChanged
        case .edits:
            event.kind != .moved && event.kind != .lifecycleChanged
                && event.kind != .deleted && event.kind != .restored
        }
    }

    static func typeKeys(for item: InventoryItem, source: any InventoryQuerySource) -> Set<String> {
        guard let catalogue = source.inventoryProtocol2Catalogue() else {
            return item.typeKey.map { [$0] } ?? []
        }
        let found =
            item.typeId.flatMap { id in catalogue.types.first { $0.id == id } }
            ?? item.typeKey.flatMap { key in catalogue.types.first { $0.key == key } }
        guard let found else { return item.typeKey.map { [$0] } ?? [] }
        return Set(catalogue.ancestry(ofType: found.id).map(\.key))
    }

    private static func syncState(of id: String, source: any InventoryQuerySource) -> InventorySync
    {
        let ledger = source.inventorySyncLedger()
        let repaired = ledger.repairs.contains { $0.entityId == id }
        let waiting = ledger.waiting.filter { $0.receipt.entityId == id }
        let status = source.inventoryReplicaStatus()
        let stale: Bool
        if case .stale = status { stale = true } else { stale = false }
        return InventorySync.derive(
            from: InventorySync.RowFacts(
                hasOpenRepair: repaired,
                isSynchronizing: waiting.contains { $0.progress != nil },
                isQueued: !waiting.isEmpty,
                isSaved: false,
                replicaIsStale: stale))
    }
}
