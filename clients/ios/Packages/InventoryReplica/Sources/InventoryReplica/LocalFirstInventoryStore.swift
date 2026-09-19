import AppCore
import Foundation

/// The `InventoryStore` whose writes land on the phone first (ADR-002 D14,
/// Phase B): `perform(_:)` returns once the change and its log entry are
/// committed to the replica, with no network involved, `undo(_:)` cancels a
/// change that has not left the device or logs a revert of one that has,
/// and `resolve(_:with:)` settles a repair the server's outcome opened.
///
/// `uploadPhoto` is local too: it stages the bytes in the replica, pinned,
/// and the drain uploads them ahead of the attach that needs them.
///
/// Reads, download, refresh and photos are `OnlineInventoryStore`'s, over the
/// same replica, whose media cache answers a staged photo from the phone, so
/// a photo taken offline shows before the server has it. Given a reachability, it also drains the log to the
/// server: once at start, after each change and Undo, on every `refresh()`
/// (which the app calls on foreground), when a backoff elapses, and when the
/// network path becomes satisfied. Without one, every change stays queued.
public final class LocalFirstInventoryStore: InventoryStore, Sendable {
    private let replica: InventoryReplica
    private let online: OnlineInventoryStore
    private let drain: InventoryDrain?
    private let mintMutationId: @Sendable () -> String
    private let now: @Sendable () -> Date

    /// - Parameters:
    ///   - pageSize: How many rows each snapshot and feed request asks for.
    ///   - mintMutationId: The idempotency key for each change and each Undo.
    ///   - now: When a change is made, stamped on its optimistic row and sent
    ///     as its client time.
    ///   - reachability: The network path the drain watches, normally
    ///     ``NetworkPathReachability``. `nil` sends nothing, for previews and
    ///     for tests of what happens on the device alone.
    ///   - drainClock: What the drain's backoff sleeps on.
    public init(
        replica: InventoryReplica,
        transport: any InventorySyncTransport,
        pageSize: Int = 250,
        mintMutationId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
        now: @escaping @Sendable () -> Date = { Date() },
        reachability: (any InventoryReachability)? = nil,
        drainClock: any InventoryDrainClock = SystemDrainClock()
    ) {
        let online = OnlineInventoryStore(
            replica: replica, transport: transport, pageSize: pageSize, now: now)
        self.replica = replica
        self.online = online
        self.drain = reachability.map { reachability in
            InventoryDrain(
                replica: replica, online: online, reachability: reachability, clock: drainClock,
                now: now, mintMutationId: mintMutationId)
        }
        self.mintMutationId = mintMutationId
        self.now = now
        drain?.start()
    }

    public func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        online.observe(query)
    }

    public func status() -> AsyncStream<InventoryReplicaStatus> {
        online.status()
    }

    public func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        let receipt = try replica.perform(command, mutationId: mintMutationId(), clientTime: now())
        drain?.request()
        return receipt
    }

    public func undo(_ receipt: InventoryReceipt) async throws {
        try replica.undo(receipt, undoMutationId: mintMutationId(), clientTime: now())
        drain?.request()
    }

    /// Settles a repair on the phone (``InventoryReplica/resolve(_:with:mintMutationId:at:)``)
    /// and asks the drain to send whatever that re-sends.
    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        try replica.resolve(repairId, with: choice, mintMutationId: mintMutationId, at: now())
        drain?.request()
    }

    public func download() async throws {
        try await online.download()
    }

    public func refresh() async {
        await online.refresh()
        drain?.request()
    }

    /// ``refresh()``, then waits for a drain pass that starts after it to
    /// end, for a background refresh whose time is short: when this returns,
    /// the feed has been read and the log sent as far as the network allowed.
    /// Returns early, leaving the pass to finish on its own, when the calling
    /// task is cancelled. Without a reachability, only refreshes.
    public func synchronize() async {
        await online.refresh()
        await drain?.requestAndWait()
    }

    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await online.photo(sha256, variant: variant)
    }

    /// Stages the bytes on the phone (``InventoryReplica/stagePhoto(sha256:data:contentType:)``)
    /// and asks the drain to upload them.
    public func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        let result = try replica.stagePhoto(sha256: sha256, data: data, contentType: contentType)
        drain?.request()
        return result
    }
}
