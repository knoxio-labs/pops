import SwiftUI

/// The approved item page for something in hand, with its Put back and Move
/// wired: either one acts at once and leaves the undo capsule behind.
internal struct InventoryInHandItemPage: View {
    private let retrieval: InventoryRetrievalItem
    private let stagesPutBack: Bool
    @State private var item: InventoryFoundationItem
    @State private var moving = false
    @State private var offer: InventoryUndoOffer?
    @State private var before: InventoryFoundationItem?

    internal init(retrieval: InventoryRetrievalItem, stagesPutBack: Bool = false) {
        self.retrieval = retrieval
        self.stagesPutBack = stagesPutBack
        _item = State(initialValue: retrieval.item)
    }

    private var detail: InventoryItemDetail {
        InventoryItemDetail(
            item: item,
            photos: retrieval.photo.map {
                [InventoryPhoto(caption: item.name, isBroken: false, imageData: $0)]
            } ?? [])
    }

    internal var body: some View {
        InventoryItemDetailView(
            detail: detail,
            onAction: { action in
                switch action.id {
                case "put-back": putBack()
                case "move": moving = true
                default: break
                }
            },
            capability: { EmptyView() }
        )
        .sheet(isPresented: $moving) {
            InventoryDestinationPickerSheet(
                title: item.name, tree: InventoryLocationFixtures.home,
                putBack: item.placement.isInHand
                    ? InventoryRetrievalFixtures.putBackDestination(retrieval) : nil,
                recent: InventoryRetrievalFixtures.recent,
                containers: InventoryLocationFixtures.openContainers,
                onChoose: place)
        }
        .inventoryUndoCapsule($offer, lingers: stagesPutBack) { _ in
            if let before { item = before }
        }
        .task {
            guard stagesPutBack else { return }
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            putBack()
        }
    }

    private func putBack() {
        guard item.placement.isInHand, let previous = retrieval.previousPlacement,
            InventoryRetrieval.canPutBack(retrieval)
        else { return }
        change(
            to: InventoryRetrieval.putBack(retrieval).placement,
            InventoryUndoOffer(message: "Put back in \(previous)", symbol: .restore))
    }

    private func place(_ destination: InventoryDestination) {
        if destination.kind == .putBack {
            putBack()
            return
        }
        change(
            to: .direct(location: destination.name),
            InventoryUndoOffer(message: "Moved to \(destination.name)", symbol: .move))
    }

    private func change(to placement: InventoryPlacement, _ next: InventoryUndoOffer) {
        before = item
        item.placement = placement
        offer = next
    }
}
