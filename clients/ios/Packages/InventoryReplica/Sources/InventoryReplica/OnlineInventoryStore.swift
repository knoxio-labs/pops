import AppCore
import Foundation
import Synchronization

/// The `InventoryStore` the app binds while every write waits for the server
/// (ADR-002 D14, Phase A): reads come from an `InventoryReplica`, and the
/// replica is filled and kept current through an `InventorySyncTransport`.
///
/// - `download()` pages the snapshot into the replica and then follows the
///   change feed. An interrupted download resumes from the snapshot cursor
///   the replica stored with its last page, not from the start.
/// - `refresh()` follows the change feed from where the replica stopped, and
///   finishes an interrupted download first.
/// - `perform(_:)` sends the command as a one-mutation batch and returns only
///   once the server has applied it; the replica is untouched until then, and
///   caught up from the feed before it returns. Anything else the server
///   answers is thrown as ``InventoryCommandError``.
/// - `undo(_:)` sends `event.revert` for the event the receipt's change wrote.
/// - A `409 resync_required`, or a feed page from another epoch, discards
///   every server row and takes a fresh snapshot, so nothing stale survives
///   it.
///
/// The status it streams adds what only a network caller knows to the
/// replica's own: refreshing, offline (the server could not be reached), and
/// blocked (`401` or `426`). Reaching the server again clears the last two.
///
/// Download, refresh and the catch-up after a write run one at a time, in the
/// order they were asked for, so two of them never page into the replica at
/// once.
public final class OnlineInventoryStore: InventoryStore, Sendable {
    let replica: InventoryReplica
    let transport: any InventorySyncTransport
    let pageSize: Int
    private let mintMutationId: @Sendable () -> String
    private let now: @Sendable () -> Date
    private let sequencer = SyncSequencer()
    /// The seq of the event each applied change wrote, by mutation id: what
    /// `undo(_:)` reverts. Held for this process only, as the Undo offer is.
    private let revertibleEvents = Mutex<[String: Int]>([:])
    /// Fronts `fetchMedia`; not the disk-backed, size-bounded cache ADR-002
    /// gives the real media cache (a later slice) — see its own header.
    private let mediaCache = InventoryMediaCache()

    /// - Parameters:
    ///   - pageSize: How many rows each snapshot and feed request asks for
    ///     (the wire allows 1 to 500).
    ///   - mintMutationId: The idempotency key for each mutation (D9).
    ///   - now: The client time each mutation carries as audit evidence.
    public init(
        replica: InventoryReplica,
        transport: any InventorySyncTransport,
        pageSize: Int = 250,
        mintMutationId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.replica = replica
        self.transport = transport
        self.pageSize = pageSize
        self.mintMutationId = mintMutationId
        self.now = now
    }

    public func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        replica.observeUntilFailure(query)
    }

    public func status() -> AsyncStream<InventoryReplicaStatus> {
        replica.observeUntilFailure(.replicaStatus)
    }

    public func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        let mutation = InventoryOutboundMutation(
            mutationId: mintMutationId(), command: command,
            baseRevision: try baseRevision(for: command), dependsOn: [], clientTime: now())
        let outcome = try await submit(mutation)
        guard case .applied(let revision, let seq, _) = outcome else {
            throw Self.failure(for: outcome)
        }
        // The server settles a change that altered nothing at the row's
        // current revision and writes no event, so there is nothing to revert.
        if revision != mutation.baseRevision {
            revertibleEvents.withLock { $0[mutation.mutationId] = seq }
        }
        await refresh()
        return InventoryReceipt(
            mutationId: mutation.mutationId, entityKind: command.entityKind,
            entityId: command.entityId)
    }

    public func undo(_ receipt: InventoryReceipt) async throws {
        guard let seq = revertibleEvents.withLock({ $0[receipt.mutationId] }) else {
            throw InventoryCommandError.nothingToUndo
        }
        _ = try await perform(
            .revertEvent(seq: seq, entityKind: receipt.entityKind, entityId: receipt.entityId))
        revertibleEvents.withLock { _ = $0.removeValue(forKey: receipt.mutationId) }
    }

    /// Always throws: while writes wait for the server, a change it does not
    /// apply is thrown by `perform(_:)`, so no repair is ever opened.
    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        throw InventoryCommandError.repairNotFound(repairId)
    }

    public func download() async throws {
        try await sequencer.run { try await self.downloadNow() }
    }

    /// Failures are not thrown: they show in `status()` as offline or
    /// blocked, and the next refresh tries again.
    public func refresh() async {
        try? await sequencer.run { try await self.refreshNow() }
    }

    /// ``download()``'s one-at-a-time rule, for a resync the drain asks for.
    func resyncKeepingLog() async throws {
        try await sequencer.run { try await self.resyncNow() }
    }

    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        if let cached = mediaCache.value(sha256: sha256, variant: variant) { return cached }
        let data = try await transport.fetchMedia(sha256: sha256, variant: variant)
        mediaCache.set(data, sha256: sha256, variant: variant)
        return data
    }

    public func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try await transport.uploadMedia(sha256: sha256, data: data, contentType: contentType)
    }

    private func submit(_ mutation: InventoryOutboundMutation) async throws
        -> InventoryMutationOutcome
    {
        let result: InventoryMutationBatchResult
        do {
            result = try await transport.submit([mutation])
        } catch {
            noteFailure(error)
            throw error
        }
        noteReached()
        guard let outcome = result.outcomes[mutation.mutationId] else {
            throw RepositoryError.contractMismatch
        }
        return outcome
    }

    /// The revision the replica holds for the command's entity (D8). A
    /// create has none; a revert is judged against the reverted event rather
    /// than a base, and a restore against the tombstone, which no query
    /// returns, so both send none as the server's own vectors do.
    private func baseRevision(for command: InventoryCommand) throws -> Int? {
        switch command {
        case .createItem, .createLocation, .revertEvent, .restoreDeletedItem:
            return nil
        default:
            switch command.entityKind {
            case .item: return try replica.read(.item(id: command.entityId))?.revision
            case .location: return try replica.read(.location(id: command.entityId))?.revision
            }
        }
    }
}
