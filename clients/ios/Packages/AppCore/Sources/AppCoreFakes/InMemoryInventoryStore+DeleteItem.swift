import AppCore
import Foundation

extension InMemoryInventoryStore {
    /// Tombstones the item and empties it if it is a container: every live
    /// item directly inside goes in hand remembering it, the way the server's
    /// `item.delete` does. Every row it touches is recorded so undo restores
    /// them together.
    static func applyDeleteItem(
        id: InventoryItem.ID, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard !item.isDeleted else { throw RepositoryError.contractMismatch }
        var rows: [InMemoryInventoryStore.UndoRow] = [.item(id: id, previous: item)]
        for (childId, child) in state.items
        where child.placement == .container(id) && !child.isDeleted {
            rows.append(.item(id: childId, previous: child))
            state.items[childId] = bumped(
                child, seq: &state.nextSeq, placement: .set(.hand),
                previousPlacement: .set(.container(id)))
        }
        state.undoLog[mutationId] = .batch(rows)
        state.items[id] = bumped(item, seq: &state.nextSeq, deletedAt: .set(Date()))
    }
}
