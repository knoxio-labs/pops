import AppCore
import Foundation

/// The `InventoryStore` whose writes land on the phone first (ADR-002 D14,
/// Phase B): `perform(_:)` returns once the change and its log entry are
/// committed to the replica, with no network involved, and `undo(_:)`
/// cancels a change that has not left the device or logs a revert of one
/// that has.
///
/// Reads, download, refresh and photos are `OnlineInventoryStore`'s, over
/// the same replica. Nothing here sends the log: the drain does, through the
/// replica's `outboundMutations(limit:)` and `recordOutcomes(_:)`, and until
/// one runs every change stays queued.
public final class LocalFirstInventoryStore: InventoryStore, Sendable {
    private let replica: InventoryReplica
    private let online: OnlineInventoryStore
    private let mintMutationId: @Sendable () -> String
    private let now: @Sendable () -> Date

    /// - Parameters:
    ///   - pageSize: How many rows each snapshot and feed request asks for.
    ///   - mintMutationId: The idempotency key for each change and each Undo.
    ///   - now: When a change is made, stamped on its optimistic row and sent
    ///     as its client time.
    public init(
        replica: InventoryReplica,
        transport: any InventorySyncTransport,
        pageSize: Int = 250,
        mintMutationId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.replica = replica
        self.online = OnlineInventoryStore(
            replica: replica, transport: transport, pageSize: pageSize, now: now)
        self.mintMutationId = mintMutationId
        self.now = now
    }

    public func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        online.observe(query)
    }

    public func status() -> AsyncStream<InventoryReplicaStatus> {
        online.status()
    }

    public func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        try replica.perform(command, mutationId: mintMutationId(), clientTime: now())
    }

    public func undo(_ receipt: InventoryReceipt) async throws {
        try replica.undo(receipt, undoMutationId: mintMutationId(), clientTime: now())
    }

    /// Always throws: repairs are not opened yet (POPS-4073).
    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        throw InventoryCommandError.repairNotFound(repairId)
    }

    public func download() async throws {
        try await online.download()
    }

    public func refresh() async {
        await online.refresh()
    }

    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await online.photo(sha256, variant: variant)
    }

    public func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try await online.uploadPhoto(sha256: sha256, data: data, contentType: contentType)
    }
}
