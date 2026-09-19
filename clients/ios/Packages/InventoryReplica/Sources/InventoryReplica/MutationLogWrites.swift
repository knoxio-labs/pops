import AppCore
import Foundation
import GRDB

/// One logged mutation, ready for the wire, with the log row it came from.
internal struct OutboundEntry {
    let entry: LogEntry
    let mutation: InventoryOutboundMutation
}

/// Logging, cancelling and addressing mutations, inside the caller's
/// transaction.
internal enum MutationLogWrites {
    /// Applies `command` to the optimistic layer and logs it as queued.
    ///
    /// It depends on the newest pending mutation that wrote any row it
    /// writes or points at, so the server never applies it ahead of a
    /// change it was made on top of (a code set on an item still being
    /// created, a move into a box not yet sent).
    static func enqueue(
        _ command: LoggedCommand, mutationId: String, primary: EntityRef, at time: Date,
        in db: Database
    ) throws -> LocalApplication {
        guard try MutationLogRows.entry(mutationId: mutationId, in: db) == nil else {
            throw InventoryCommandError.rejected(
                reason: .invalid, message: "mutation \(mutationId) is already logged")
        }
        let application = try LocalReducer.apply(command, primary: primary, at: time, in: db)
        let sendsBase: Bool
        if case .command(let command) = command {
            sendsBase = LocalReducer.sendsBaseRevision(command)
        } else {
            sendsBase = false
        }
        let entry = LogEntry(
            localSeq: nil, mutationId: mutationId, entity: primary, command: command,
            dependsOn: try dependencies(
                of: application.touched.union(application.references), in: db),
            baseRevision: sendsBase ? application.baseRevision : nil, state: .queued,
            outcome: nil, settlesAtSeq: nil, touched: application.touched,
            change: application.change, attempts: 0, createdAt: storedDate(time),
            lastAttemptAt: nil)
        try MutationLogRows.insert(entry, in: db)
        return application
    }

    /// Drops `target` and every cancellable mutation depending on it, however
    /// indirectly, then rebases so the rows they wrote show their base again.
    static func cancel(_ target: LogEntry, in db: Database) throws {
        var cancelled = [target]
        var ids: Set<String> = [target.mutationId]
        var found = true
        let entries = try MutationLogRows.entries(db)
        while found {
            found = false
            for entry in entries
            where !ids.contains(entry.mutationId) && entry.state.isCancellable
                && entry.dependsOn.contains(where: ids.contains)
            {
                cancelled.append(entry)
                ids.insert(entry.mutationId)
                found = true
            }
        }
        try MutationLogRows.delete(Array(ids), in: db)
        let touched = cancelled.reduce(into: Set<EntityRef>()) { $0.formUnion($1.touched) }
        try MutationLogReplay.rebase(resetting: touched, in: db)
    }

    /// What the drain may send, addressed for the wire, in stable
    /// topological order (``DrainOrder``). A mutation is held back, along
    /// with everything depending on it, when it is in `skipped`, in flight,
    /// conflicted or rejected, or an Undo whose change has no applied outcome
    /// naming its event yet.
    static func outbound(excluding skipped: Set<String>, in db: Database) throws
        -> [OutboundEntry]
    {
        let log = try MutationLogRows.entries(
            in: [.queued, .deferred, .sending, .conflicted, .rejected], db)
        var held = skipped.union(
            log.filter { !($0.state == .queued || $0.state == .deferred) }.map(\.mutationId))
        let sendable = DrainOrder.ordered(
            log.filter { !held.contains($0.mutationId) }, id: \.mutationId,
            dependsOn: \.dependsOn)
        var outbound: [OutboundEntry] = []
        for entry in sendable {
            guard !entry.dependsOn.contains(where: held.contains),
                let command = try command(sending: entry, in: db)
            else {
                held.insert(entry.mutationId)
                continue
            }
            let mutation = InventoryOutboundMutation(
                mutationId: entry.mutationId, command: command, baseRevision: entry.baseRevision,
                dependsOn: entry.dependsOn,
                clientTime: Date(timeIntervalSinceReferenceDate: entry.createdAt))
            outbound.append(OutboundEntry(entry: entry, mutation: mutation))
        }
        return outbound
    }

    /// Deletes every unsent Undo whose change ended conflicted or rejected,
    /// so it is never sent. What was logged on top of such an Undo depends
    /// on what the Undo depended on instead, so it stays held behind the
    /// unapplied change until a repair settles it.
    ///
    /// - Returns: The rows the dropped Undos wrote, for the rebase to reset.
    static func dropUndosOfUnappliedChanges(in db: Database) throws -> Set<EntityRef> {
        let unapplied = Set(
            try MutationLogRows.entries(in: [.conflicted, .rejected], db).map(\.mutationId))
        guard !unapplied.isEmpty else { return [] }
        let pending = try MutationLogRows.entries(in: [.queued, .deferred], db)
        let dropped = pending.filter { entry in
            guard case .undo(let target) = entry.command else { return false }
            return unapplied.contains(target)
        }
        guard !dropped.isEmpty else { return [] }
        let inherited = Dictionary(
            uniqueKeysWithValues: dropped.map { ($0.mutationId, $0.dependsOn) })
        for var entry in pending
        where inherited[entry.mutationId] == nil
            && entry.dependsOn.contains(where: { inherited[$0] != nil })
        {
            var dependsOn: [String] = []
            for id in entry.dependsOn {
                for replacement in inherited[id] ?? [id] where !dependsOn.contains(replacement) {
                    dependsOn.append(replacement)
                }
            }
            entry.dependsOn = dependsOn.sorted()
            try MutationLogRows.update(entry, in: db)
        }
        try MutationLogRows.delete(Array(inherited.keys), in: db)
        return dropped.reduce(into: Set<EntityRef>()) { $0.formUnion($1.touched) }
    }

    static func command(sending entry: LogEntry, in db: Database) throws -> InventoryCommand? {
        switch entry.command {
        case .command(let command):
            return command
        case .undo(let targetId):
            guard let target = try MutationLogRows.entry(mutationId: targetId, in: db),
                let seq = target.outcome?.appliedSeq,
                let kind = InventoryEntityKind(storageValue: target.entity.kind)
            else { return nil }
            return .revertEvent(seq: seq, entityKind: kind, entityId: target.entity.id)
        }
    }

    private static func dependencies(of refs: Set<EntityRef>, in db: Database) throws -> [String] {
        let pending = try MutationLogRows.entries(in: [.queued, .sending, .deferred], db)
        var latest: [String] = []
        for ref in refs {
            if let owner = pending.last(where: { $0.touched.contains(ref) }),
                !latest.contains(owner.mutationId)
            {
                latest.append(owner.mutationId)
            }
        }
        return latest.sorted()
    }
}
