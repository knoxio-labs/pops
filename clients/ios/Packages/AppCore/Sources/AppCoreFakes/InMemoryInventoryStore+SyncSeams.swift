import AppCore

/// Test seams for the Sync page and its row marks (ADR-002's iOS replica
/// design): setting the replica status, and staging repairs and waiting
/// mutations directly, because the mutation log and drain that would
/// otherwise produce them do not exist yet (B3/B4).
extension InMemoryInventoryStore {
    /// Sets the replica status directly, for a test driving the shell's
    /// offline or blocked states without a real transport.
    public func setReplicaStatus(_ status: InventoryReplicaStatus) {
        let snapshot = state.withLock { current -> State in
            current.replicaStatus = status
            return current
        }
        notify(snapshot)
    }

    /// Sets or clears the sync ledger's sending stall, for a test driving
    /// the Sync page's stuck state without a real drain.
    public func setSendingStall(_ stall: InventorySendingStall?) {
        let snapshot = state.withLock { current -> State in
            current.sendingStall = stall
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

    /// Adds a mutation waiting to sync, for a test exercising the Sync page
    /// and a row's mark without a real mutation log (B3/B4).
    public func addWaitingMutation(_ mutation: InventoryQueuedMutation) {
        let snapshot = state.withLock { current -> State in
            current.waiting.append(mutation)
            return current
        }
        notify(snapshot)
    }

    /// Moves a waiting mutation into the drain's current batch, or back out
    /// of it: `progress` set is "Syncing", `nil` is "Waiting to sync".
    public func setWaitingMutationProgress(mutationId: String, progress: Double?) {
        let snapshot = state.withLock { current -> State in
            guard
                let index = current.waiting.firstIndex(where: {
                    $0.receipt.mutationId == mutationId
                })
            else { return current }
            let existing = current.waiting[index]
            current.waiting[index] = InventoryQueuedMutation(
                receipt: existing.receipt, command: existing.command,
                enqueuedAt: existing.enqueuedAt, progress: progress, hold: existing.hold)
            return current
        }
        notify(snapshot)
    }

    /// Removes a waiting mutation, for a test simulating the drain finishing
    /// it (`applied`) without a real transport.
    public func removeWaitingMutation(mutationId: String) {
        let snapshot = state.withLock { current -> State in
            current.waiting.removeAll { $0.receipt.mutationId == mutationId }
            return current
        }
        notify(snapshot)
    }

    /// Makes the next `perform(_:)` or `download()` fail with
    /// `InventoryStorageError.full`, for a test driving the Storage full
    /// alert without a real free-space check (B1).
    public func setStorageFull(_ isFull: Bool = true) {
        state.withLock { $0.forcedStorageFull = isFull }
    }
}
