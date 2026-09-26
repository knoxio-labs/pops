import AppCore
import SwiftUI

internal enum InventoryProtocol2EntryReordering {
    internal static func move(
        draggedID: String?, targetID: String, entries: [InventoryProtocol2DraftEntry]
    ) -> (id: String, offset: Int)? {
        guard let draggedID, draggedID != targetID,
            let sourceIndex = entries.firstIndex(where: { $0.id == draggedID }),
            let targetIndex = entries.firstIndex(where: { $0.id == targetID }),
            sourceIndex != targetIndex
        else { return nil }
        return (draggedID, targetIndex > sourceIndex ? 1 : -1)
    }
}

internal struct InventoryProtocol2EntryDropDelegate: DropDelegate {
    let targetID: String
    let entries: [InventoryProtocol2DraftEntry]
    @Binding var draggedID: String?
    let move: (String, Int) -> Void

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [.plainText])
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        guard
            let decision = InventoryProtocol2EntryReordering.move(
                draggedID: draggedID, targetID: targetID, entries: entries)
        else { return }
        move(decision.id, decision.offset)
    }

    func performDrop(info: DropInfo) -> Bool {
        draggedID = nil
        return true
    }
}
