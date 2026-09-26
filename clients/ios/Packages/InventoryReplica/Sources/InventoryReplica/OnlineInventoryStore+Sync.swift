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
        try await snapshot(from: nil, resyncing: true)
        try await followFeed()
    }

    /// Pages the snapshot into the replica from `cursor`. Each page is stored
    /// with the cursor after it, which is where an interrupted download
    /// resumes. A resync discards the replica's server rows only in the
    /// transaction that stores its first page, so a fetch that fails before
    /// then leaves the last usable replica, and the next refresh meets the
    /// same `409` and tries again.
    private func snapshot(from cursor: String?, resyncing: Bool = false) async throws {
        var cursor = cursor
        var resyncing = resyncing
        repeat {
            let page = try await transport.fetchSnapshot(cursor: cursor, limit: pageSize)
            if let next = page.nextCursor, next == cursor { throw RepositoryError.contractMismatch }
            try await apply(page, resyncing: resyncing)
            resyncing = false
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
            try await apply(page)
            guard page.hasMore else { break }
            guard page.nextSince > since else { throw RepositoryError.contractMismatch }
        }
        try await refreshCatalogueIfAnnounced()
    }

    private func refreshCatalogueIfAnnounced() async throws {
        let position = try replica.syncPosition()
        if position.announcedCatalogueRevision != nil { return }
        guard position.needsCatalogue else { return }
        let known = position.storedCatalogueVersion
        if let catalogue = try await transport.fetchCatalogue(knownVersion: known) {
            try replica.store(catalogue)
        }
    }

    private func apply(_ page: InventorySnapshotPage, resyncing: Bool) async throws {
        try Self.requireSupported(page.minimumProtocol)
        guard let revision = page.catalogueRevision else {
            return try replica.apply(page, resyncing: resyncing)
        }
        let catalogue = try await exactCatalogue(revision)
        try replica.apply(
            page, catalogue: catalogue,
            referencedCatalogues: try await unheldCatalogues(namedBy: page.items, pinned: revision),
            resyncing: resyncing)
    }

    private func apply(_ page: InventoryChangesPage) async throws {
        try Self.requireSupported(page.minimumProtocol)
        guard let revision = page.catalogueRevision else { return try replica.apply(page) }
        let catalogue = try await exactCatalogue(revision)
        try replica.apply(
            page, catalogue: catalogue,
            referencedCatalogues: try await unheldCatalogues(namedBy: page.items, pinned: revision))
    }

    /// Every revision other than the pinned one that the page's items name
    /// and this phone does not hold. A publication leaves an unchanged item's
    /// values at the revision they were written under, so a page can name
    /// revisions older than the one it pins; each is fetched once, oldest
    /// first, and a failed fetch applies nothing, so the next sync asks again.
    private func unheldCatalogues(namedBy items: [InventoryItem], pinned: Int) async throws
        -> [InventoryCatalogueSnapshot]
    {
        let named = Set(items.flatMap(\.namedCatalogueRevisions)).subtracting([pinned])
        var catalogues: [InventoryCatalogueSnapshot] = []
        for revision in try replica.unheldCatalogueRevisions(named).sorted() {
            catalogues.append(try await exactCatalogue(revision))
        }
        return catalogues
    }

    /// The exact revision a page names, fetched before the page is applied
    /// so its rows and cursor are never stored against a catalogue this
    /// phone does not hold. Any other revision (a race with a publish) is a
    /// mismatch, and nothing is applied; the next refresh asks again.
    private func exactCatalogue(_ revision: Int) async throws -> InventoryCatalogueSnapshot {
        let catalogue = try await transport.fetchCatalogue(revision: revision)
        guard catalogue.revision.revision == revision else {
            throw RepositoryError.contractMismatch
        }
        try Self.requireSupported(catalogue.revision.minimumProtocol)
        return catalogue
    }

    /// A page or catalogue this build is too old to read is refused as the
    /// server's own `426` is, so it shows as blocked (`appTooOld`).
    private static func requireSupported(_ minimumProtocol: Int) throws {
        guard minimumProtocol <= supportedProtocol else {
            throw InventorySyncTransportError.clientTooOld
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

    static func isUnreachable(_ error: any Error) -> Bool {
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
        case .rejected(let reason, let message, _, _):
            InventoryCommandError.rejected(reason: reason, message: message)
        // A mutation sent alone depends on nothing, so it has nothing to wait
        // for; and `applied` is not a failure at all.
        case .deferred, .applied:
            RepositoryError.contractMismatch
        }
    }
}

extension InventoryItem {
    fileprivate var namedCatalogueRevisions: [Int] {
        var revisions = fieldValues.map(\.catalogueRevision)
        if let catalogueRevision { revisions.append(catalogueRevision) }
        for computed in computedValues {
            revisions.append(computed.catalogueRevision)
            if case .overridden(_, let overrideRevision) = computed.evaluation {
                revisions.append(overrideRevision)
            }
        }
        return revisions
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
