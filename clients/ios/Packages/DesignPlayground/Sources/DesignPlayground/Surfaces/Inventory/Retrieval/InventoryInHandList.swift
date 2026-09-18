import DesignSystem
import SwiftUI

/// Everything in hand, with the removals Undo can still reverse. The In hand
/// page and the dashboard's In hand section each act on one, so a row there
/// behaves exactly as it does here.
internal struct InventoryInHandList: Equatable {
    internal private(set) var items: [InventoryRetrievalItem]
    private var removals: [String: InventoryListRemoval<InventoryRetrievalItem>] = [:]

    internal init(_ items: [InventoryRetrievalItem]) {
        self.items = items
    }

    internal var isEmpty: Bool { items.isEmpty }

    /// Puts back every row in `ids` that has somewhere to go, and returns
    /// what the undo capsule says, or nil when nothing moved.
    internal mutating func putBack(_ ids: Set<String>) -> InventoryUndoOffer? {
        let removal = InventoryInHand.putBack(ids, from: &items)
        guard let first = removal.entries.first else { return nil }
        let message =
            removal.count == 1
            ? "Put back in \(first.element.previousPlacement ?? "its place")"
            : "Put \(removal.count) back"
        return record(removal, InventoryUndoOffer(message: message, symbol: .restore))
    }

    /// Moves every row in `ids` to `destination`; the picker's Put back row
    /// puts them back instead.
    internal mutating func move(
        _ ids: Set<String>, to destination: InventoryDestination
    ) -> InventoryUndoOffer? {
        if destination.kind == .putBack { return putBack(ids) }
        let removal = items.remove(ids: ids)
        guard !removal.isEmpty else { return nil }
        let message =
            removal.count == 1
            ? "Moved to \(destination.name)" : "Moved \(removal.count) to \(destination.name)"
        return record(removal, InventoryUndoOffer(message: message, symbol: .move))
    }

    /// Returns the rows `offer` took, to the places they left from.
    internal mutating func undo(_ offer: InventoryUndoOffer) {
        guard let removal = removals.removeValue(forKey: offer.id) else { return }
        items.restore(removal)
    }

    private mutating func record(
        _ removal: InventoryListRemoval<InventoryRetrievalItem>, _ offer: InventoryUndoOffer
    ) -> InventoryUndoOffer {
        removals[offer.id] = removal
        return offer
    }
}

/// Which in-hand rows a Move carries, and whether the picker offers Put back.
internal struct InventoryInHandMoveRequest: Identifiable {
    internal let ids: Set<String>
    internal let title: String
    internal let putBack: InventoryDestination?

    internal init(_ retrieval: InventoryRetrievalItem) {
        self.init(
            ids: [retrieval.id], title: retrieval.item.name,
            putBack: InventoryRetrievalFixtures.putBackDestination(retrieval))
    }

    /// A Move for several selected rows at once. One row moves as it would
    /// from its own swipe; several have no single Put back to offer.
    internal init(_ items: [InventoryRetrievalItem]) {
        if items.count == 1, let only = items.first {
            self.init(only)
        } else {
            self.init(ids: Set(items.map(\.id)), title: "\(items.count) things", putBack: nil)
        }
    }

    private init(ids: Set<String>, title: String, putBack: InventoryDestination?) {
        self.ids = ids
        self.title = title
        self.putBack = putBack
    }

    internal var id: String { ids.sorted().joined(separator: ",") }
}

/// The in-hand rows inside a list panel: photo, name over where each came
/// from, Put back on the trailing edge, and the same swipes everywhere.
internal struct InventoryInHandRows: View {
    internal let items: [InventoryRetrievalItem]
    @Binding internal var selection: InventorySelection
    internal let onPutBack: (Set<String>) -> Void
    internal let onMove: (InventoryRetrievalItem) -> Void
    @State private var activeSwipe: String?

    internal var body: some View {
        InventoryGroundedListPanel {
            VStack(spacing: PopsSpacing.zero) {
                ForEach(items) { retrieval in
                    row(retrieval)
                        .transition(InventoryMotion.row)
                    if retrieval.id != items.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private func row(_ retrieval: InventoryRetrievalItem) -> some View {
        NavigationLink {
            InventoryInHandItemPage(retrieval: retrieval)
        } label: {
            InventoryInHandRowLabel(
                retrieval: retrieval, onPutBack: { onPutBack([retrieval.id]) },
                onMove: { onMove(retrieval) })
        }
        .buttonStyle(.plain)
        .inventorySelectable(retrieval.id, in: $selection)
        .inventoryInHandSwipes(
            retrieval,
            isActive: activeSwipe == retrieval.id,
            onPresentationChanged: { presented in
                if presented {
                    activeSwipe = retrieval.id
                } else if activeSwipe == retrieval.id {
                    activeSwipe = nil
                }
            },
            onMove: { onMove(retrieval) },
            onPutBack: { onPutBack([retrieval.id]) })
    }
}

extension View {
    /// Selection mode's bar for in-hand rows: Put back and Move.
    internal func inventoryInHandSelectionBar(
        _ selection: Binding<InventorySelection>,
        list: InventoryInHandList,
        onPutBack: @escaping (Set<String>) -> Void,
        onMove: @escaping (InventoryInHandMoveRequest) -> Void
    ) -> some View {
        inventorySelectionBar(
            selection, all: list.items.map(\.id),
            actions: [
                InventorySelectionAction(title: "Put back", symbol: .restore, perform: onPutBack),
                InventorySelectionAction(title: "Move", symbol: .move) { ids in
                    onMove(InventoryInHandMoveRequest(list.items.filter { ids.contains($0.id) }))
                },
            ]
        )
        .onChange(of: list.items.map(\.id)) { _, present in
            selection.wrappedValue.keepOnly(Set(present))
        }
    }

    /// The picker a Move opens and the undo capsule every In hand action
    /// leaves, both acting on `list`. `lingers` keeps the capsule up for a
    /// staged state.
    internal func inventoryInHandActions(
        _ list: Binding<InventoryInHandList>,
        moving: Binding<InventoryInHandMoveRequest?>,
        offer: Binding<InventoryUndoOffer?>,
        lingers: Bool = false
    ) -> some View {
        sheet(item: moving) { request in
            InventoryDestinationPickerSheet(
                title: request.title, tree: InventoryLocationFixtures.home,
                putBack: request.putBack,
                recent: InventoryRetrievalFixtures.recent,
                containers: InventoryLocationFixtures.openContainers,
                onChoose: { destination in
                    if let next = list.wrappedValue.move(request.ids, to: destination) {
                        offer.wrappedValue = next
                    }
                })
        }
        .inventoryUndoCapsule(offer, lingers: lingers) { list.wrappedValue.undo($0) }
    }
}
