/// One container as its page and the lists need it: the item's own detail,
/// what it holds, and the manual full flag.
///
/// Furniture that holds things has no access state: it is never opened,
/// closed or picked up, only moved and stored into (ADR-001).
internal struct InventoryContainerProfile: Identifiable {
    internal let detail: InventoryItemDetail
    internal let contents: InventoryContainerContents
    internal let isFull: Bool
    internal let isFurniture: Bool
    internal let updated: String

    internal init(
        detail: InventoryItemDetail,
        contents: InventoryContainerContents = InventoryContainerContents(),
        isFull: Bool = false,
        isFurniture: Bool = false,
        updated: String = "Today"
    ) {
        self.detail = detail
        self.contents = contents
        self.isFull = isFull
        self.isFurniture = isFurniture
        self.updated = updated
    }

    internal var id: String { item.id }
    internal var item: InventoryFoundationItem { detail.item }
    internal var isOpen: Bool { item.access == .open && isActive }
    internal var isClosed: Bool { item.access == .closed && isActive }
    internal var isActive: Bool { item.lifecycle == .active }
    internal var path: String { item.placement.crumbs.joined(separator: " › ") }

    /// The same container after Close. Only an open one changes: furniture
    /// and retired containers have nothing to close.
    internal func closed() -> InventoryContainerProfile {
        guard isOpen else { return self }
        var item = detail.item
        item.access = .closed
        return replacing(item)
    }

    /// The same container, retired: it stops counting as somewhere to put
    /// things, and can be restored like any retirement.
    internal func retired() -> InventoryContainerProfile {
        guard isActive else { return self }
        var item = detail.item
        item.lifecycle = .retired
        return replacing(item)
    }

    /// The same container, kept and stored directly in `place`.
    internal func stored(in place: String) -> InventoryContainerProfile {
        var item = detail.item
        item.placement = .direct(location: place)
        return replacing(item)
    }

    private func replacing(_ item: InventoryFoundationItem) -> InventoryContainerProfile {
        InventoryContainerProfile(
            detail: InventoryItemDetail(
                item: item,
                photos: detail.photos,
                externalIdentifiers: detail.externalIdentifiers,
                description: detail.description,
                fields: detail.fields,
                connections: detail.connections,
                containerSummary: detail.containerSummary,
                provenance: detail.provenance,
                documents: detail.documents,
                activity: detail.activity,
                conflict: detail.conflict,
                lastSynced: detail.lastSynced),
            contents: contents,
            isFull: isFull,
            isFurniture: isFurniture,
            updated: updated)
    }
}

/// The verbs a container's page puts in its action row: Pick up, Move,
/// Open or Close, Store here.
///
/// Built here rather than taken from ``InventoryAction/available(for:style:)``
/// because containment changes two things that list does not know: Store here
/// is offered whatever the access state, and furniture is never picked up.
internal enum InventoryContainerActions {
    internal static let storeHereID = "store-here"

    internal static func row(for profile: InventoryContainerProfile) -> [InventoryAction] {
        let item = profile.item
        guard profile.isActive else {
            return InventoryItemDetailPrimaryAction.row(
                for: item, style: InventoryFoundationStyle())
        }
        let move = InventoryAction("move", "Move", symbol: .move, heading: .whereItIs)
        if profile.isFurniture { return [move, storeHere] }
        var row = [pickUp(item), move]
        switch item.access {
        case .open:
            row.append(InventoryAction("close", "Close", symbol: .close, heading: .container))
        case .closed, .sealed:
            row.append(
                InventoryAction("reopen", "Open", symbol: .open, heading: .container))
        case nil:
            break
        }
        return row + [storeHere]
    }

    private static let storeHere = InventoryAction(
        storeHereID, "Store here", symbol: .storeHere, heading: .container)

    private static func pickUp(_ item: InventoryFoundationItem) -> InventoryAction {
        if case .inHand(let previous) = item.placement, previous != nil {
            return InventoryAction("put-back", "Put back", symbol: .restore, heading: .whereItIs)
        }
        return InventoryAction("pick-up", "Pick up", symbol: .inHand, heading: .whereItIs)
    }
}

/// What the containers browser can narrow to.
internal enum InventoryContainerFilter: String, CaseIterable, Identifiable {
    case all
    case open
    case closed
    case full
    case retired

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .all: "All"
        case .open: "Open"
        case .closed: "Closed"
        case .full: "Full"
        case .retired: "Retired"
        }
    }

    internal func matches(_ profile: InventoryContainerProfile) -> Bool {
        switch self {
        case .all: true
        case .open: profile.isOpen
        case .closed: profile.isClosed
        case .full: profile.isFull && profile.isActive
        case .retired: !profile.isActive
        }
    }
}

/// The browser's stats strip.
internal struct InventoryContainerStats: Equatable {
    internal let open: Int
    internal let closed: Int
    internal let full: Int
    internal let total: Int

    internal init(_ profiles: [InventoryContainerProfile]) {
        open = profiles.filter(InventoryContainerFilter.open.matches).count
        closed = profiles.filter(InventoryContainerFilter.closed.matches).count
        full = profiles.filter(InventoryContainerFilter.full.matches).count
        total = profiles.count
    }
}
