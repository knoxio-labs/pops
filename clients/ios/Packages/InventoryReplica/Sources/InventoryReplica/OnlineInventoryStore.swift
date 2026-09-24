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
///   answers is thrown as ``InventoryCommandError``. It carries the
///   catalogue revision the command was authored against; answered
///   `catalogue_update_required`, it refreshes and sends the command once
///   more against the newer revision the refresh stored.
/// - A page, or the pinned catalogue a page names, whose `minimumProtocol` is
///   above ``supportedProtocol`` is refused before anything is applied, and
///   shows as blocked (`appTooOld`).
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
    /// The newest sync protocol this build speaks.
    static let supportedProtocol = 2

    let replica: InventoryReplica
    let transport: any InventorySyncTransport
    let pageSize: Int
    private let mintMutationId: @Sendable () -> String
    private let now: @Sendable () -> Date
    private let sequencer = SyncSequencer()
    /// The seq of the event each applied change wrote, by mutation id: what
    /// `undo(_:)` reverts. Held for this process only, as the Undo offer is.
    private let revertibleEvents = Mutex<[String: Int]>([:])

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
        var mutation = InventoryOutboundMutation(
            mutationId: mintMutationId(), command: command,
            baseRevision: try baseRevision(for: command), dependsOn: [], clientTime: now(),
            catalogueRevision: try catalogueRevision(for: command))
        var outcome = try await submit(mutation)
        if case .rejected(.catalogueUpdateRequired, _) = outcome,
            let moved = try await movedToNewerCatalogue(mutation)
        {
            mutation = moved
            outcome = try await submit(mutation)
        }
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

    /// ``refresh()``, throwing what stopped it, for a caller that has to know
    /// whether the server was reached (a change waiting on a newer catalogue).
    func refreshThrowing() async throws {
        try await sequencer.run { try await self.refreshNow() }
    }

    /// ``download()``'s one-at-a-time rule, for a resync the drain asks for.
    func resyncKeepingLog() async throws {
        try await sequencer.run { try await self.resyncNow() }
    }

    /// Answers from the replica's media cache when it holds the variant (or
    /// staged the photo), and otherwise fetches it and keeps a copy.
    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        if let held = try replica.cachedPhoto(sha256, variant: variant) { return held }
        let data = try await transport.fetchMedia(sha256: sha256, variant: variant)
        // The photo was fetched; failing to keep a copy (a full disk) only
        // costs fetching it again, so the caller still gets it.
        try? replica.cachePhoto(data, sha256: sha256, variant: variant)
        return data
    }

    public func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try await transport.uploadMedia(sha256: sha256, data: data, contentType: contentType)
    }

    /// Nothing is ever staged locally by this store, so there is nothing to
    /// discard.
    public func discardPhoto(_ sha256: String) async throws {}

    public func settleTypeArrival(typeKey: String) async throws {
        try replica.settleTypeArrival(typeKey: typeKey)
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

    /// The catalogue revision the command is judged against
    /// (`InventoryCommand.sentCatalogueRevision(active:)`), with the one the
    /// replica holds as the active one. Never a revision nobody saw: a
    /// computed override needs one, and without a stored catalogue it is
    /// refused before anything is sent.
    private func catalogueRevision(for command: InventoryCommand) throws -> Int? {
        let stored = try replica.syncPosition().storedCatalogueRevision
        switch command {
        case .setComputedOverride, .clearComputedOverride:
            guard stored != nil else {
                throw InventoryCommandError.rejected(
                    reason: .catalogueUpdateRequired,
                    message: "no catalogue revision is on this phone; refresh and try again")
            }
        default:
            break
        }
        return command.sentCatalogueRevision(active: stored)
    }

    /// `catalogue_update_required`: refreshes, and answers the mutation moved
    /// onto the newer revision the refresh stored, under a new id (the server
    /// answers an id it has seen with its stored outcome). Nil, so the
    /// refusal is thrown, when the refresh brought nothing newer. A refresh
    /// that finds this build too old for the catalogue throws, which also
    /// shows as blocked.
    private func movedToNewerCatalogue(_ mutation: InventoryOutboundMutation) async throws
        -> InventoryOutboundMutation?
    {
        try await refreshThrowing()
        guard let active = try replica.syncPosition().storedCatalogueRevision,
            active > mutation.catalogueRevision ?? 0
        else { return nil }
        let moved = mutation.command.movedTo(catalogueRevision: active)
        return InventoryOutboundMutation(
            mutationId: mintMutationId(), command: moved,
            baseRevision: mutation.baseRevision, dependsOn: mutation.dependsOn,
            clientTime: mutation.clientTime,
            catalogueRevision: moved.sentCatalogueRevision(active: active))
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
