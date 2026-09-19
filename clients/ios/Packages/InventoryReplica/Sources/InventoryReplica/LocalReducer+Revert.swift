import AppCore
import Foundation
import GRDB

/// `revert.ts`, over what this phone knows of the change being undone.
///
/// The server writes an event's `before` values back over its fields, and
/// refuses when a later change touched one of them. The phone holds that
/// before and after only for its own changes (the log row's
/// ``PrimaryChange``), so it reverts those, and calls a field changed since
/// when its current value no longer equals the change's `after`. A revert of
/// anyone else's event is left to the server: the phone cannot rebuild it
/// faithfully from the history the feed delivers.
extension LocalReducer {
    private static let irreversibleKinds: Set<String> = ["created", "split_from", "split_into"]

    func revertEvent(seq: Int, entityId: String) throws -> Written {
        if let event = try storedEvent(seq: seq) {
            guard event.entityId == entityId else {
                throw refusal(.invalid, "event \(seq) is not about \(entityId)")
            }
            guard !Self.irreversibleKinds.contains(event.kind) else {
                throw refusal(.illegalTransition, "a \(event.kind) event cannot be reverted")
            }
        }
        if let change = try MutationLogRows.change(ofOutcomeSeq: seq, in: db) {
            guard change.after.ref.id == entityId else {
                throw refusal(.invalid, "event \(seq) is not about \(entityId)")
            }
            return try revert(change)
        }
        return try currentRevision()
    }

    /// Undoes one of this phone's own logged changes. A change that altered
    /// nothing has nothing to undo.
    func undo(of mutationId: String) throws -> Written {
        guard let change = try MutationLogRows.entry(mutationId: mutationId, in: db)?.change else {
            throw InventoryCommandError.nothingToUndo
        }
        return try revert(change)
    }

    private func revert(_ change: PrimaryChange) throws -> Written {
        guard !Self.irreversibleKinds.contains(change.eventKind) else {
            throw refusal(.illegalTransition, "a \(change.eventKind) event cannot be reverted")
        }
        switch (change.before, change.after) {
        case (.item(let before), .item(let after)):
            guard !(change.fields.contains("lifecycle") && after.lifecycle == "destroyed") else {
                throw refusal(.illegalTransition, "destroying an item cannot be undone")
            }
            let current = try liveItem(after.id)
            try assertUntouched(change.fields, current: current, after: after)
            let restored = current.restoring(change.fields, from: before)
            if restored.placement != current.placement {
                try assertPlacementAllowed(itemId: current.id, to: restored.placement.domainValue)
            }
            return try update(current, to: restored, kind: "reverted") ?? unchanged(current)
        case (.location(let before), .location(let after)):
            let current = try liveLocation(after.id)
            try assertUntouched(change.fields, current: current, after: after)
            let restored = current.restoring(change.fields, from: before)
            if restored.parentId != current.parentId {
                try assertParentAllowed(locationId: current.id, parentId: restored.parentId)
            }
            return try update(current, to: restored, kind: "reverted") ?? unchanged(current)
        default:
            throw InventoryReplicaError.corruptValue("a change whose two sides differ in kind")
        }
    }

    private func assertUntouched<Entity: WorkingRow>(
        _ fields: [String], current: Entity, after: Entity
    ) throws {
        guard let field = current.changedFields(to: after).first(where: fields.contains) else {
            return
        }
        throw InventoryCommandError.fieldConflict(
            field: field, mine: "", theirs: "", source: .thisDevice,
            at: Date(timeIntervalSinceReferenceDate: now), currentRevision: current.revision)
    }

    private func storedEvent(seq: Int) throws -> (entityId: String, kind: String)? {
        guard
            let row = try Row.fetchOne(
                db, sql: "SELECT entity_id, kind FROM event WHERE seq = ?", arguments: [seq])
        else { return nil }
        return (try row.decode(forColumn: "entity_id"), try row.decode(forColumn: "kind"))
    }

    private func currentRevision() throws -> Written {
        Written(revision: try revision(of: primaryEntity) ?? 0, eventIndex: nil)
    }
}
