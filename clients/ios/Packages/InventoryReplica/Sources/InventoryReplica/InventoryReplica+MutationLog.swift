import AppCore
import Foundation
import GRDB

/// The mutation log (ADR-002 D11): a change is applied to the optimistic
/// layer and logged in one transaction, and the log is what the drain sends.
///
/// Sending is not this file's job. A drain takes ``outboundMutations(limit:)``,
/// marks them with ``markSending(_:at:)``, submits them through
/// `InventorySyncTransport`, and hands the result to ``recordOutcomes(_:)``,
/// or, when the batch never reached the server, to ``returnToQueue(_:)``.
extension InventoryReplica {
    /// Applies `command` locally and logs it for the drain, in one
    /// transaction: when this returns, the change is on disk and every query
    /// shows it, whether or not the server has seen it.
    ///
    /// - Parameters:
    ///   - mutationId: The idempotency key the drain will send it under.
    ///   - clientTime: When it was made. Also the time the optimistic row is
    ///     stamped with, so replaying it later gives the same row.
    /// - Throws: ``AppCore/InventoryCommandError`` when the server would
    ///   refuse it too (an invalid value, a cycle, a code another item
    ///   holds, a target that does not exist); nothing is logged then.
    public func perform(
        _ command: InventoryCommand, mutationId: String, clientTime: Date
    ) throws -> InventoryReceipt {
        _ = try performLocally(command, mutationId: mutationId, clientTime: clientTime)
        return InventoryReceipt(
            mutationId: mutationId, entityKind: command.entityKind, entityId: command.entityId)
    }

    /// Undoes a change made through ``perform(_:mutationId:clientTime:)``:
    /// cancels it if it has not left the device (with anything logged after
    /// it that depends on it), and otherwise logs a revert of it, which the
    /// drain sends as `event.revert` once the change's own outcome names the
    /// event.
    ///
    /// - Throws: ``AppCore/InventoryCommandError/nothingToUndo`` when the
    ///   log has no such change, or it altered nothing;
    ///   ``AppCore/InventoryCommandError`` when the server would refuse the
    ///   revert (undoing a create or a destroy, or a field changed since).
    public func undo(_ receipt: InventoryReceipt, undoMutationId: String, clientTime: Date) throws {
        try write { db in
            guard let target = try MutationLogRows.entry(mutationId: receipt.mutationId, in: db)
            else { throw InventoryCommandError.nothingToUndo }
            if target.state.isCancellable {
                try MutationLogWrites.cancel(target, in: db)
            } else {
                guard target.change != nil else { throw InventoryCommandError.nothingToUndo }
                _ = try MutationLogWrites.enqueue(
                    .undo(of: target.mutationId), mutationId: undoMutationId,
                    primary: target.entity, at: clientTime, in: db)
            }
        }
    }

    /// The mutations the drain may send next, oldest first: queued and
    /// deferred ones, each as the server expects it. An Undo whose change has
    /// not been applied yet is held back until it has.
    public func outboundMutations(limit: Int = 50) throws -> [InventoryOutboundMutation] {
        try database.read { db in
            try MutationLogWrites.outbound(in: db).prefix(limit).map(\.mutation)
        }
    }

    /// Marks mutations as in flight, counting the attempt.
    public func markSending(_ mutationIds: [String], at time: Date) throws {
        try write { db in
            for id in mutationIds {
                guard var entry = try MutationLogRows.entry(mutationId: id, in: db) else {
                    continue
                }
                entry.state = .sending
                entry.attempts += 1
                entry.lastAttemptAt = storedDate(time)
                try MutationLogRows.update(entry, in: db)
            }
        }
    }

    /// Puts in-flight mutations back in the queue, for a batch that never
    /// reached the server. The next attempt resends them under the same ids.
    public func returnToQueue(_ mutationIds: [String]) throws {
        try write { db in
            for id in mutationIds {
                guard var entry = try MutationLogRows.entry(mutationId: id, in: db),
                    entry.state == .sending
                else { continue }
                entry.state = .queued
                try MutationLogRows.update(entry, in: db)
            }
        }
    }

    /// Records the server's outcomes and rebases on them, in one
    /// transaction. An applied change keeps showing, at the revision the
    /// server gave it, until the feed has caught up to the batch's
    /// high-water `seq`; a conflicted or rejected one stops being replayed,
    /// so its rows show the server's state.
    public func recordOutcomes(_ result: InventoryMutationBatchResult) throws {
        try write { db in
            for (id, outcome) in result.outcomes {
                guard var entry = try MutationLogRows.entry(mutationId: id, in: db) else {
                    continue
                }
                let stored = StoredOutcome(outcome)
                entry.outcome = stored
                entry.state = stored.state
                entry.settlesAtSeq = stored.appliedRevision == nil ? nil : result.highWaterSeq
                try MutationLogRows.update(entry, in: db)
            }
            try MutationLogReplay.rebase(resetting: [], in: db)
        }
    }

    /// ``perform(_:mutationId:clientTime:)``, answering with what the reducer
    /// did, which the command-vector tests compare with the server's outcome.
    func performLocally(
        _ command: InventoryCommand, mutationId: String, clientTime: Date
    ) throws -> LocalApplication {
        try write { db in
            try MutationLogWrites.enqueue(
                .command(command), mutationId: mutationId,
                primary: EntityRef(kind: command.entityKind.storageValue, id: command.entityId),
                at: clientTime, in: db)
        }
    }
}
