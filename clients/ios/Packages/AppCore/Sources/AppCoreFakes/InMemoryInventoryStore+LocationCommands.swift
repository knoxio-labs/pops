import AppCore
import Foundation

/// Location-command application for `InMemoryInventoryStore`, split out for
/// the same reason `InMemoryInventoryStore+ItemCommands.swift` is.
extension InMemoryInventoryStore {
    static func applyLocationCommand(
        _ command: InventoryCommand, mutationId: String, into state: inout State
    ) throws {
        switch command {
        case .createLocation(let new):
            try applyCreateLocation(new, mutationId: mutationId, into: &state)
        case .renameLocation(let id, let name):
            try applyRenameLocation(id: id, name: name, mutationId: mutationId, into: &state)
        case .moveLocation(let id, let parentId):
            try applyMoveLocation(id: id, parentId: parentId, mutationId: mutationId, into: &state)
        case .deleteLocation(let id):
            try applyDeleteLocation(id: id, mutationId: mutationId, into: &state)
        default:
            throw RepositoryError.contractMismatch
        }
    }

    private static func applyCreateLocation(
        _ new: InventoryNewLocation, mutationId: String, into state: inout State
    ) throws {
        guard state.locations[new.id] == nil else { throw RepositoryError.contractMismatch }
        state.locations[new.id] = InventoryLocation(
            id: new.id, revision: 1, seq: state.nextSeq, name: new.name, parentId: new.parentId,
            sortOrder: new.sortOrder)
        state.nextSeq += 1
        state.undoLog[mutationId] = .location(nil)
    }

    private static func applyRenameLocation(
        id: InventoryLocation.ID, name: String, mutationId: String, into state: inout State
    ) throws {
        let location = try require(state.locations[id])
        state.undoLog[mutationId] = .location(location)
        state.locations[id] = bumped(location, seq: &state.nextSeq, name: .set(name))
    }

    private static func applyMoveLocation(
        id: InventoryLocation.ID, parentId: InventoryLocation.ID?, mutationId: String,
        into state: inout State
    ) throws {
        let location = try require(state.locations[id])
        guard parentId != id else { throw RepositoryError.contractMismatch }
        state.undoLog[mutationId] = .location(location)
        state.locations[id] = bumped(location, seq: &state.nextSeq, parentId: .set(parentId))
    }

    /// Reparents every direct child location and every item placed directly
    /// here (ADR-002 D2): a child place moves to this one's parent, and a
    /// direct item either follows it there or, at a root, goes in hand
    /// remembering this place as its previous placement. Every row this
    /// touches (the location itself, each reparented child location, each
    /// moved item) is recorded so undo can put all of them back, not just
    /// the deleted location.
    private static func applyDeleteLocation(
        id: InventoryLocation.ID, mutationId: String, into state: inout State
    ) throws {
        let location = try require(state.locations[id])
        var rows: [InMemoryInventoryStore.UndoRow] = [.location(id: id, previous: location)]
        for (childId, child) in state.locations where child.parentId == id {
            rows.append(.location(id: childId, previous: child))
            state.locations[childId] = bumped(
                child, seq: &state.nextSeq, parentId: .set(location.parentId))
        }
        for (itemId, item) in state.items where item.placement == .location(id) {
            rows.append(.item(id: itemId, previous: item))
            if let parentId = location.parentId {
                state.items[itemId] = bumped(
                    item, seq: &state.nextSeq, placement: .set(.location(parentId)))
            } else {
                state.items[itemId] = bumped(
                    item, seq: &state.nextSeq, placement: .set(.hand),
                    previousPlacement: .set(.location(id)))
            }
        }
        state.undoLog[mutationId] = .batch(rows)
        state.locations[id] = bumped(location, seq: &state.nextSeq, deletedAt: .set(Date()))
    }
}
