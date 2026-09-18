import AppCore
import DesignSystem
import SwiftUI

/// The in-hand list's rules, kept out of the views so they can be tested
/// without one: which rows Put back takes, and whether Put all back is
/// offered.
internal enum InventoryInHand {
    internal typealias Item = InventoryDashboard.InHandItem

    /// Put all back appears once there is more than one thing in hand.
    internal static func offersPutAllBack(_ items: [Item]) -> Bool {
        items.count > 1
    }

    /// Whether Put back has anywhere to go for at least one of `items`.
    internal static func canPutAnyBack(_ items: [Item]) -> Bool {
        items.contains { $0.previous.putBackPlacement != nil }
    }

    /// The moves that put back every one of `ids` with somewhere to go, and
    /// what the undo capsule says about them, or nil when none has. A row
    /// whose previous place was deleted, or that never had one, stays in
    /// hand, waiting for a Move.
    /// One row Put back is taking, and where.
    private struct Returning {
        let id: InventoryItem.ID
        let placeName: String
        let placement: InventoryPlacement
    }

    internal static func putBack(
        _ ids: Set<InventoryItem.ID>, from items: [Item]
    ) -> (commands: [InventoryCommand], offer: InventoryUndoOffer)? {
        let returning = items.compactMap { item -> Returning? in
            guard ids.contains(item.id), case .place(let name, let placement) = item.previous
            else { return nil }
            return Returning(id: item.id, placeName: name, placement: placement)
        }
        guard let first = returning.first else { return nil }
        let message =
            returning.count == 1
            ? "Put back in \(first.placeName)" : "Put \(returning.count) back"
        return (
            returning.map { .moveItem(id: $0.id, to: $0.placement, verb: .putBack) },
            InventoryUndoOffer(message: message, symbol: .restore)
        )
    }
}

extension InventoryWriter {
    /// Puts back every one of `ids` that has somewhere to go, with one Undo
    /// for all of them. Does nothing when none has.
    internal func putBack(_ ids: Set<InventoryItem.ID>, from items: [InventoryInHand.Item]) async {
        guard let plan = InventoryInHand.putBack(ids, from: items) else { return }
        await perform(plan.commands, offering: plan.offer)
    }
}

/// Which rows a Move carries, and what the picker is titled.
internal struct InventoryMoveRequest: Identifiable, Equatable {
    internal let ids: Set<String>
    internal let title: String

    internal var id: String { ids.sorted().joined(separator: ",") }

    /// A Move for in-hand rows: one row is named, several are counted.
    internal init(inHand items: [InventoryInHand.Item]) {
        if items.count == 1, let only = items.first {
            self.init(ids: [only.id], title: only.name)
        } else {
            self.init(ids: Set(items.map(\.id)), title: "\(items.count) things")
        }
    }

    internal init(ids: Set<String>, title: String) {
        self.ids = ids
        self.title = title
    }
}

extension View {
    /// What a Move opens. The destination picker moves into this package with
    /// containers and locations (POPS-4064) and replaces this sheet's body;
    /// until then it is the pending screen the dashboard already shows.
    internal func inventoryMoveSheet(_ request: Binding<InventoryMoveRequest?>) -> some View {
        sheet(item: request) { request in
            NavigationStack {
                InventoryPendingScreen(
                    title: "Move \(request.title)",
                    detail: "The place picker opens here.",
                    symbol: InventorySymbol.move.system)
            }
        }
    }

    /// Selection mode's bar for in-hand rows: Put back and Move. A row that
    /// leaves the list by any route stops counting as selected.
    internal func inventoryInHandSelectionBar(
        _ selection: Binding<InventorySelection>,
        items: [InventoryInHand.Item],
        onPutBack: @escaping (Set<String>) -> Void,
        onMove: @escaping (InventoryMoveRequest) -> Void
    ) -> some View {
        inventorySelectionBar(
            selection, all: items.map(\.id),
            actions: [
                InventorySelectionAction(title: "Put back", symbol: .restore, perform: onPutBack),
                InventorySelectionAction(title: "Move", symbol: .move) { ids in
                    onMove(InventoryMoveRequest(inHand: items.filter { ids.contains($0.id) }))
                },
            ]
        )
        .onChange(of: items.map(\.id)) { _, present in
            selection.wrappedValue.keepOnly(Set(present))
        }
    }
}
