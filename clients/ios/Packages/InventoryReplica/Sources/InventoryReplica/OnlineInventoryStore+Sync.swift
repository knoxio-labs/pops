import AppCore
import Synchronization

extension OnlineInventoryStore {
    func downloadNow() async throws {
        replica.updateActivity { $0.isDownloading = true }
        defer { replica.updateActivity { $0.isDownloading = false } }
        try await recovering {
            let position = try self.replica.syncPosition()
            if position.since == nil || position.snapshotCursor != nil {
                try await self.snapshot(from: position.snapshotCursor)
            }
            try await self.followFeed()
        }
    }

    func refreshNow() async throws {
        let position = try replica.syncPosition()
        if position.snapshotCursor != nil { return try await downloadNow() }
        guard position.since != nil else { return }
        replica.updateActivity { $0.isRefreshing = true }
        defer { replica.updateActivity { $0.isRefreshing = false } }
        try await recovering { try await self.followFeed() }
    }

    /// Runs one sync operation, answering a resync with a fresh snapshot
    /// once, and records in the replica's activity whether the server was
    /// reached. A resync that is itself refused is thrown rather than retried,
    /// so a server that keeps answering 409 cannot loop the phone.
    private func recovering(_ body: @Sendable () async throws -> Void) async throws {
        do {
            do {
                try await body()
            } catch  where Self.needsResync(error) {
                try await resync()
            }
            noteReached()
        } catch {
            noteFailure(error)
            throw error
        }
    }

    /// A fresh snapshot whatever the feed says, for a `409` the drain met
    /// while sending. The mutation log is kept and replayed over it.
    func resyncNow() async throws {
        try await recovering { try await self.resync() }
    }

    private func resync() async throws {
        replica.updateActivity { $0.isDownloading = true }
        defer { replica.updateActivity { $0.isDownloading = false } }
        try replica.resetForResync()
        try await snapshot(from: nil)
        try await followFeed()
    }

    /// Pages the snapshot into the replica from `cursor`. Each page is stored
    /// with the cursor after it, which is where an interrupted download
    /// resumes.
    private func snapshot(from cursor: String?) async throws {
        var cursor = cursor
        repeat {
            let page = try await transport.fetchSnapshot(cursor: cursor, limit: pageSize)
            if let next = page.nextCursor, next == cursor { throw RepositoryError.contractMismatch }
            try replica.apply(page)
            cursor = page.nextCursor
        } while cursor != nil
        try await refreshCatalogueIfAnnounced()
    }

    private func followFeed() async throws {
        while true {
            let position = try replica.syncPosition()
            guard let since = position.since, let epoch = position.epoch else {
                throw InventoryReplicaError.notDownloaded
            }
            let page = try await transport.fetchChanges(since: since, epoch: epoch, limit: pageSize)
            try replica.apply(page)
            guard page.hasMore else { break }
            guard page.nextSince > since else { throw RepositoryError.contractMismatch }
        }
        try await refreshCatalogueIfAnnounced()
    }

    private func refreshCatalogueIfAnnounced() async throws {
        let position = try replica.syncPosition()
        guard position.needsCatalogue else { return }
        let known = position.storedCatalogueVersion
        if let catalogue = try await transport.fetchCatalogue(knownVersion: known) {
            try replica.store(catalogue)
        }
    }

    func noteReached() {
        replica.updateActivity {
            $0.isOffline = false
            $0.blocked = nil
        }
    }

    func noteFailure(_ error: any Error) {
        if let reason = Self.blockReason(for: error) {
            replica.updateActivity { $0.blocked = reason }
        } else if Self.isUnreachable(error) {
            replica.updateActivity { $0.isOffline = true }
        }
    }

    static func needsResync(_ error: any Error) -> Bool {
        if error as? InventorySyncTransportError == .resyncRequired { return true }
        if case .epochMismatch = error as? InventoryReplicaError { return true }
        return false
    }

    static func blockReason(for error: any Error) -> InventoryBlockReason? {
        if error as? InventorySyncTransportError == .clientTooOld { return .appTooOld }
        if error as? RepositoryError == .unauthorized { return .sessionExpired }
        return nil
    }

    private static func isUnreachable(_ error: any Error) -> Bool {
        switch error as? RepositoryError {
        case .transport, .unavailable: true
        default: false
        }
    }

    /// What a non-applied outcome of a lone mutation means to the caller.
    static func failure(for outcome: InventoryMutationOutcome) -> any Error {
        switch outcome {
        case .conflictField(let field, let mine, let theirs, let source, let at, let revision):
            InventoryCommandError.fieldConflict(
                field: field, mine: mine, theirs: theirs, source: source, at: at,
                currentRevision: revision)
        case .conflictCodeCollision(let heldById, let heldByName, let suggestedCode):
            InventoryCommandError.codeCollision(
                heldById: heldById, heldByName: heldByName, suggestedCode: suggestedCode)
        case .conflictDeleted(let source, let at):
            InventoryCommandError.deletedElsewhere(source: source, at: at)
        case .rejected(let reason, let message):
            InventoryCommandError.rejected(reason: reason, message: message)
        // A mutation sent alone depends on nothing, so it has nothing to wait
        // for; and `applied` is not a failure at all.
        case .deferred, .applied:
            RepositoryError.contractMismatch
        }
    }
}

/// Runs async work one piece at a time, in the order it was asked for. A
/// piece that fails does not stop the next.
internal final class SyncSequencer: Sendable {
    private let tail = Mutex<Task<Void, Never>?>(nil)

    func run(_ work: @escaping @Sendable () async throws -> Void) async throws {
        let task = tail.withLock { tail -> Task<Void, any Error> in
            let previous = tail
            let task = Task {
                await previous?.value
                try await work()
            }
            tail = Task { _ = await task.result }
            return task
        }
        try await task.value
    }
}
