import Foundation

/// Retrieval and unpacking, in the words ADR-001 already settled: pick up,
/// put back, move, close.
///
/// `InventoryPlacement.inHand` remembers one previous placement as a string,
/// which is all a row displays. Retrieval also needs to know whether that
/// place still exists, so the fact lives here, beside the item, rather than
/// inside the shared vocabulary POPS-3979 settled.
internal enum InventoryPreviousPlacementStatus: Equatable {
    /// The previous placement still exists, closed or not.
    case current
    /// The location or container it names no longer exists.
    case deleted
}

/// An in-hand item, with what retrieval needs to know about where it came
/// from that a plain row does not carry.
internal struct InventoryRetrievalItem: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let previousStatus: InventoryPreviousPlacementStatus
    internal let photo: Data?

    internal var id: String { item.id }

    internal init(
        _ item: InventoryFoundationItem,
        previousStatus: InventoryPreviousPlacementStatus = .current,
        photo: Data? = nil
    ) {
        self.item = item
        self.previousStatus = previousStatus
        self.photo = photo
    }

    /// Where Put back returns it, when it has anywhere to return to.
    internal var previousPlacement: String? {
        guard case .inHand(let previous?) = item.placement, !previous.isEmpty else { return nil }
        return previous
    }

    /// The row's second line: where it came from, or why Put back is gone.
    internal var fromLine: String {
        if previousStatus == .deleted { return "Previous place deleted" }
        return previousPlacement.map { "From \($0)" } ?? "Nowhere recorded"
    }
}

/// What a person can do with an in-hand item, worked out from what is known
/// about where it came from, kept out of the views so it can be tested
/// without one.
internal enum InventoryRetrieval {
    /// Whether Put back has somewhere to go. False only when nothing is
    /// recorded or that place is gone; a closed container still takes it
    /// back.
    internal static func canPutBack(_ retrieval: InventoryRetrievalItem) -> Bool {
        retrieval.previousPlacement != nil && retrieval.previousStatus != .deleted
    }

    /// The item as it reads after being put back: placed directly at its
    /// previous destination. Unchanged when ``canPutBack`` is false.
    internal static func putBack(_ retrieval: InventoryRetrievalItem) -> InventoryFoundationItem {
        guard canPutBack(retrieval), let previous = retrieval.previousPlacement else {
            return retrieval.item
        }
        var updated = retrieval.item
        updated.placement = .direct(location: previous)
        return updated
    }

    /// The item as it reads once picked up, remembering where it was so a
    /// later put-back has somewhere to go. Picking up an item already in hand
    /// changes nothing: there is no second "previous" to remember.
    internal static func pickUp(_ item: InventoryFoundationItem) -> InventoryFoundationItem {
        guard !item.placement.isInHand else { return item }
        var updated = item
        updated.placement = .inHand(
            previous: item.placement.crumbs.last ?? item.placement.effectiveLocation)
        return updated
    }
}

/// Rows that left a list, and the positions they left from, so Undo puts
/// each one back where it was rather than at the end.
internal struct InventoryListRemoval<Element: Equatable>: Equatable {
    internal struct Entry: Equatable {
        internal let offset: Int
        internal let element: Element
    }

    internal let entries: [Entry]

    internal var isEmpty: Bool { entries.isEmpty }
    internal var count: Int { entries.count }
}

extension Array where Element: Identifiable & Equatable {
    /// Removes every element whose id is in `ids` and passes `admits`,
    /// returning them with their positions.
    internal mutating func remove(
        ids: Set<Element.ID>, where admits: (Element) -> Bool = { _ in true }
    ) -> InventoryListRemoval<Element> {
        let entries = enumerated()
            .filter { ids.contains($0.element.id) && admits($0.element) }
            .map { InventoryListRemoval.Entry(offset: $0.offset, element: $0.element) }
        let leaving = Set(entries.map(\.element.id))
        removeAll { leaving.contains($0.id) }
        return InventoryListRemoval(entries: entries)
    }

    /// Puts removed elements back at the positions they left from.
    internal mutating func restore(_ removal: InventoryListRemoval<Element>) {
        for entry in removal.entries.sorted(by: { $0.offset < $1.offset }) {
            insert(entry.element, at: Swift.min(entry.offset, count))
        }
    }
}

/// The in-hand list's rules: which rows Put back takes, and whether Put all
/// back is offered.
internal enum InventoryInHand {
    /// Put back takes only the rows that have somewhere to go; a row whose
    /// previous place was deleted stays, waiting for a Move.
    internal static func putBack(
        _ ids: Set<String>, from items: inout [InventoryRetrievalItem]
    ) -> InventoryListRemoval<InventoryRetrievalItem> {
        items.remove(ids: ids, where: InventoryRetrieval.canPutBack)
    }

    /// Put all back appears once there is more than one thing in hand.
    internal static func offersPutAllBack(_ items: [InventoryRetrievalItem]) -> Bool {
        items.count > 1
    }
}

/// What closing a container mid-unpack resolves. Closing never checks
/// whether the box is empty: ADR-001's "close" stops a container accepting
/// items and says nothing about what is inside it.
internal enum InventoryUnpackingOutcome: Equatable {
    case closedPartial(remaining: Int)
    case empty
}

internal enum InventoryUnpacking {
    /// Whether taking `removed` out leaves nothing inside a container that
    /// held something: the one moment Keep or Retire is offered. A container
    /// that was always empty never asks.
    internal static func justEmptied(
        _ contents: InventoryContainerContents, removed: Set<String>
    ) -> Bool {
        !contents.isEmpty && contents.entries.allSatisfy { removed.contains($0.id) }
    }

    internal static func closeOutcome(
        _ contents: InventoryContainerContents, removed: Set<String>
    ) -> InventoryUnpackingOutcome {
        let remaining = contents.entries.filter { !removed.contains($0.id) }.count
        return remaining == 0 ? .empty : .closedPartial(remaining: remaining)
    }
}

/// The choice an emptied container offers, as two equal buttons.
internal enum InventoryEmptyContainerChoice: String, CaseIterable, Identifiable {
    case keep
    case retire

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .keep: "Keep"
        case .retire: "Retire"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .keep: .storeHere
        case .retire: .retired
        }
    }
}
