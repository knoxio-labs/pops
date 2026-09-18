import SwiftUI

/// Catalogue records a list shows, with what Pick up and Move did to them
/// and the state Undo returns to. The Items browser and Search results both
/// act on one: the rows stay, and their placement line changes.
internal struct InventoryRecordEdits: Equatable {
    internal private(set) var records: [InventorySearchRecord]
    private var before: [String: [InventorySearchRecord]] = [:]

    internal init(_ records: [InventorySearchRecord]) {
        self.records = records
    }

    internal mutating func pickUp(_ ids: Set<String>) -> InventoryUndoOffer? {
        let what = subject(ids)
        return change(ids, InventoryUndoOffer(message: "Picked up \(what)", symbol: .inHand)) {
            InventoryRetrieval.pickUp($0)
        }
    }

    internal mutating func move(
        _ ids: Set<String>, to destination: InventoryDestination
    ) -> InventoryUndoOffer? {
        let message =
            ids.count == 1
            ? "Moved to \(destination.name)" : "Moved \(ids.count) to \(destination.name)"
        return change(ids, InventoryUndoOffer(message: message, symbol: .move)) { item in
            var moved = item
            moved.placement =
                destination.isContainer
                ? .contained(location: nil, containers: [destination.name])
                : .direct(location: destination.name)
            return moved
        }
    }

    /// Discards every selected record whole, a group included, the same as
    /// Item detail's Discard with no reason.
    internal mutating func discard(_ ids: Set<String>) -> InventoryUndoOffer? {
        let what = subject(ids)
        return change(ids, InventoryUndoOffer(message: "Discarded \(what)", symbol: .discard)) {
            var discarded = $0
            if discarded.lifecycle == .active { discarded.lifecycle = .discarded }
            return discarded
        }
    }

    internal mutating func undo(_ offer: InventoryUndoOffer) {
        guard let previous = before.removeValue(forKey: offer.id) else { return }
        records = previous
    }

    /// One record's name, or how many.
    internal func subject(_ ids: Set<String>) -> String {
        guard ids.count == 1, let id = ids.first, let record = records.first(where: { $0.id == id })
        else { return "\(ids.count)" }
        return record.item.name
    }

    private mutating func change(
        _ ids: Set<String>, _ offer: InventoryUndoOffer,
        _ transform: (InventoryFoundationItem) -> InventoryFoundationItem
    ) -> InventoryUndoOffer? {
        guard records.contains(where: { ids.contains($0.id) }) else { return nil }
        before[offer.id] = records
        records = records.map { ids.contains($0.id) ? $0.replacing(transform($0.item)) : $0 }
        return offer
    }
}

extension InventorySearchRecord {
    fileprivate func replacing(_ item: InventoryFoundationItem) -> InventorySearchRecord {
        InventorySearchRecord(
            item: item, externalIdentifier: externalIdentifier, note: note,
            capabilities: capabilities, photo: photo, addedDaysAgo: addedDaysAgo)
    }
}

/// Which records a Move from a list carries.
internal struct InventoryRecordMoveRequest: Identifiable {
    internal let ids: Set<String>
    internal let title: String

    internal var id: String { ids.sorted().joined(separator: ",") }
}

extension View {
    /// The picker a record Move opens and the undo capsule every record
    /// action leaves, both acting on `edits`; landing an action clears
    /// `selection`.
    internal func inventoryRecordActions(
        _ edits: Binding<InventoryRecordEdits>,
        selection: Binding<InventorySelection>,
        moving: Binding<InventoryRecordMoveRequest?>,
        offer: Binding<InventoryUndoOffer?>,
        lingers: Bool = false
    ) -> some View {
        sheet(item: moving) { request in
            InventoryDestinationPickerSheet(
                title: request.title, tree: InventoryLocationFixtures.home,
                recent: InventoryRetrievalFixtures.recent,
                containers: InventoryLocationFixtures.openContainers,
                onChoose: { destination in
                    if let next = edits.wrappedValue.move(request.ids, to: destination) {
                        offer.wrappedValue = next
                        selection.wrappedValue.deselectAll()
                    }
                })
        }
        .inventoryUndoCapsule(offer, lingers: lingers) { edits.wrappedValue.undo($0) }
    }

    /// Pick up and Move for selected records, then whatever else `extra`
    /// adds, then Discard.
    internal func inventoryRecordSelectionBar(
        _ edits: Binding<InventoryRecordEdits>,
        selection: Binding<InventorySelection>,
        all ids: [String],
        moving: Binding<InventoryRecordMoveRequest?>,
        offer: Binding<InventoryUndoOffer?>,
        extra: [InventorySelectionAction] = []
    ) -> some View {
        inventorySelectionBar(
            selection, all: ids,
            actions: [
                InventorySelectionAction(title: "Pick up", symbol: .inHand) { ids in
                    if let next = edits.wrappedValue.pickUp(ids) {
                        offer.wrappedValue = next
                        selection.wrappedValue.deselectAll()
                    }
                },
                InventorySelectionAction(title: "Move", symbol: .move) { ids in
                    moving.wrappedValue = InventoryRecordMoveRequest(
                        ids: ids,
                        title: ids.count == 1
                            ? edits.wrappedValue.subject(ids) : "\(ids.count) items")
                },
            ] + extra + [
                InventorySelectionAction(title: "Discard", symbol: .discard) { ids in
                    if let next = edits.wrappedValue.discard(ids) {
                        offer.wrappedValue = next
                        selection.wrappedValue.deselectAll()
                    }
                }
            ])
    }
}
