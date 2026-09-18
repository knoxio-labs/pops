import AppCore
import Foundation
import Synchronization

/// A fixed, mutable Inventory replica for feature tests: `InventoryReplica`
/// (ADR-002 A11) is the real implementation, this is a same-process stand-in
/// that supports the write path far enough to exercise view models without a
/// GRDB dependency in a test target.
///
/// It does not implement ADR-002's revision or conflict rules (D8): every
/// command applies as given, which is correct for a fake driving a feature
/// test and would be a lie in production. `InventoryReplica`'s Swift command
/// reducer is pinned to the server's own behaviour by shared test vectors;
/// this type answers to neither. It keeps no event log either: `events` is
/// what a test seeds for the history and recent-work reads, and `perform(_:)`
/// never appends to it. Command application itself lives in
/// `InMemoryInventoryStore+ItemCommands.swift` and
/// `InMemoryInventoryStore+LocationCommands.swift`; this file is the seam
/// (`InventoryStore` conformance) and the shared state those two read and
/// write.
public final class InMemoryInventoryStore: InventoryStore, @unchecked Sendable {
    struct Observer: Sendable {
        let deliver: @Sendable (State) -> Void
    }

    /// What `undo(_:)` needs to put a receipt's change back the way it was:
    /// the entity's prior value, or its absence for a create.
    enum UndoEntry {
        case item(InventoryItem?)
        case location(InventoryLocation?)
    }

    let state: Mutex<State>

    public init(
        items: [InventoryItem] = [],
        locations: [InventoryLocation] = [],
        catalogue: InventoryCatalogue = InventoryCatalogue(version: "fake", units: [], types: []),
        repairs: [InventoryRepair] = [],
        media: [String: Data] = [:],
        events: [InventoryEvent] = []
    ) {
        state = Mutex(
            State(
                items: Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) }),
                locations: Dictionary(uniqueKeysWithValues: locations.map { ($0.id, $0) }),
                catalogue: catalogue,
                repairs: repairs,
                resolved: [],
                media: media,
                events: events,
                replicaStatus: .current,
                nextSeq: (items.map(\.seq) + locations.map(\.seq) + events.map(\.seq)).max()
                    .map { $0 + 1 } ?? 1
            ))
    }

    // MARK: - InventoryStore

    public func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { continuation in
            let id = UUID()
            let deliver: @Sendable (State) -> Void = { snapshot in
                continuation.yield(query.read(snapshot))
            }
            let initial = state.withLock { current -> State in
                current.observers[id] = Observer(deliver: deliver)
                return current
            }
            deliver(initial)
            continuation.onTermination = { [weak self] _ in
                self?.state.withLock { _ = $0.observers.removeValue(forKey: id) }
            }
        }
    }

    public func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        let mutationId = UUID().uuidString
        let snapshot = try state.withLock { current -> State in
            try Self.apply(command, mutationId: mutationId, into: &current)
            return current
        }
        notify(snapshot)
        return InventoryReceipt(
            mutationId: mutationId,
            entityKind: Self.entityKind(of: command),
            entityId: command.entityId ?? mutationId)
    }

    public func undo(_ receipt: InventoryReceipt) async throws {
        let snapshot = try state.withLock { current -> State in
            guard let entry = current.undoLog.removeValue(forKey: receipt.mutationId) else {
                throw RepositoryError.contractMismatch
            }
            switch entry {
            case .item(let previous):
                current.items[receipt.entityId] = previous
            case .location(let previous):
                current.locations[receipt.entityId] = previous
            }
            return current
        }
        notify(snapshot)
    }

    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        let snapshot = try state.withLock { current -> State in
            guard let index = current.repairs.firstIndex(where: { $0.id == repairId }) else {
                throw RepositoryError.contractMismatch
            }
            let repair = current.repairs.remove(at: index)
            let outcome: String
            switch choice {
            case .keepMine(let code):
                outcome = code.map { "Relabelled \($0)" } ?? "Kept mine"
            case .discardMine:
                outcome = "Discarded mine"
            }
            current.resolved.insert(
                InventoryResolvedEntry(
                    id: repair.id, entityId: repair.entityId, outcome: outcome,
                    resolvedAt: Date()),
                at: 0)
            return current
        }
        notify(snapshot)
    }

    public func download() async throws {
        let snapshot = state.withLock { current -> State in
            current.replicaStatus = .current
            return current
        }
        notify(snapshot)
    }

    public func refresh() async {
        let snapshot = state.withLock { current -> State in
            current.replicaStatus = .current
            return current
        }
        notify(snapshot)
    }

    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try state.withLock { current in
            guard let data = current.media[sha256] else { throw RepositoryError.contractMismatch }
            return data
        }
    }

    public func status() -> AsyncStream<InventoryReplicaStatus> {
        observe(.replicaStatus)
    }

    // MARK: - Test seams

    /// Sets the replica status directly, for a test driving the shell's
    /// offline or blocked states without a real transport.
    public func setReplicaStatus(_ status: InventoryReplicaStatus) {
        let snapshot = state.withLock { current -> State in
            current.replicaStatus = status
            return current
        }
        notify(snapshot)
    }

    /// Adds a repair directly, for a test exercising the sync ledger without
    /// driving a real conflict through `perform(_:)`.
    public func addRepair(_ repair: InventoryRepair) {
        let snapshot = state.withLock { current -> State in
            current.repairs.append(repair)
            return current
        }
        notify(snapshot)
    }

    // MARK: - Private

    private func notify(_ snapshot: State) {
        for observer in snapshot.observers.values { observer.deliver(snapshot) }
    }

    private static func entityKind(of command: InventoryCommand) -> InventoryEntityKind {
        switch command {
        case .createLocation, .renameLocation, .moveLocation, .deleteLocation:
            .location
        default:
            .item
        }
    }

    /// Groups every command into the three files that actually apply it, so
    /// this switch stays a dispatch table rather than growing back into the
    /// nineteen-case reducer it replaced.
    static func apply(
        _ command: InventoryCommand, mutationId: String, into state: inout State
    ) throws {
        switch command {
        case .createItem, .editItem, .changeItemType, .setItemCode, .moveItem:
            try applyItemGroupA(command, mutationId: mutationId, into: &state)
        case .setItemAccess, .setItemFull, .setItemLifecycle, .setItemQuantity, .splitItem,
            .attachPhoto, .removePhoto, .reorderPhotos, .restoreDeletedItem:
            try applyItemGroupB(command, mutationId: mutationId, into: &state)
        case .createLocation, .renameLocation, .moveLocation, .deleteLocation:
            try applyLocationCommand(command, mutationId: mutationId, into: &state)
        case .revertEvent:
            throw RepositoryError.contractMismatch
        }
    }
}
