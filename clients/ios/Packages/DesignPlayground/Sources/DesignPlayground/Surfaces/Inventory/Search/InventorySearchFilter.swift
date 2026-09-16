/// One narrowing condition a reviewer can add to a search or a browse list.
///
/// Grouped the way the ticket names them, placement, lifecycle, container
/// state, category, quantity, missing information, sync/repair state, each
/// as an independent predicate rather than one enum of mutually exclusive
/// values, because a reader may want "open containers" and "needs repair" at
/// once.
internal enum InventorySearchFilter: CaseIterable, Hashable, Identifiable {
    case inHand
    case directPlacement
    case inContainer
    case openContainers
    case closedContainers
    case missingType
    case noneLeft
    case needsRepair

    internal var id: Self { self }

    internal var title: String {
        switch self {
        case .inHand: "In hand"
        case .directPlacement: "Directly placed"
        case .inContainer: "In a container"
        case .openContainers: "Open containers"
        case .closedContainers: "Closed containers"
        case .missingType: "No type yet"
        case .noneLeft: "None left"
        case .needsRepair: "Needs repair"
        }
    }

    /// The group a filter sheet lists it under.
    internal var section: String {
        switch self {
        case .inHand, .directPlacement, .inContainer: "Placement"
        case .openContainers, .closedContainers: "Container state"
        case .missingType: "Missing information"
        case .noneLeft: "Quantity"
        case .needsRepair: "Sync and repair"
        }
    }

    internal func matches(_ record: InventorySearchRecord) -> Bool {
        let item = record.item
        switch self {
        case .inHand: return item.placement.isInHand
        case .directPlacement: return isDirect(item.placement)
        case .inContainer: return isContained(item.placement)
        case .openContainers: return item.access == .open
        case .closedContainers: return item.access == .closed || item.access == .sealed
        case .missingType: return item.typeName == nil
        case .noneLeft: return item.quantity.count < 1
        case .needsRepair: return item.sync == .needsAttention
        }
    }

    private func isDirect(_ placement: InventoryPlacement) -> Bool {
        if case .direct = placement { return true }
        return false
    }

    private func isContained(_ placement: InventoryPlacement) -> Bool {
        if case .contained = placement { return true }
        return false
    }
}

/// How a result list is ordered. "Best match" is the query's own order ,
/// whatever ``InventorySearchEngine`` returned, so it is stable rather than
/// re-sorted to a rule nobody asked for.
internal enum InventorySearchSort: CaseIterable, Hashable, Identifiable {
    case relevance
    case name

    internal var id: Self { self }

    internal var title: String {
        switch self {
        case .relevance: "Best match"
        case .name: "Name"
        }
    }
}

extension [InventorySearchMatch] {
    internal func sorted(by sort: InventorySearchSort) -> [InventorySearchMatch] {
        switch sort {
        case .relevance: return self
        case .name: return sorted { $0.record.item.name < $1.record.item.name }
        }
    }
}
