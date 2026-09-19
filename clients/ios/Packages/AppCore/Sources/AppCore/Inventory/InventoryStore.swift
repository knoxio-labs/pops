import Foundation

/// Which rendition of a photo `InventoryStore.photo(_:variant:)` asks for.
/// Matches the sizes ADR-002's media route derives: 256 px and 1024 px, plus
/// the original.
public enum InventoryPhotoVariant: Hashable, Sendable {
    case thumb
    case medium
    case full
}

/// Where the on-device replica stands, per ADR-002's per-replica state
/// machine. Drives the shell banner and the Sync page header; a row's own
/// `InventorySync` is derived separately (`InventorySync.derive`).
public enum InventoryReplicaStatus: Hashable, Sendable {
    case empty
    case downloading(progress: Double)
    case current
    case refreshing
    case offline(lastRefreshAt: Date?)
    case stale(lastRefreshAt: Date?)
    /// Session expired, or this build is below the server's minimum
    /// protocol version (`426 client_too_old`).
    case blocked(reason: InventoryBlockReason)
}

/// Why the replica stopped refreshing itself.
public enum InventoryBlockReason: Hashable, Sendable {
    case sessionExpired
    case appTooOld
}

/// Everything the Sync page lists: what is waiting, what needs attention, and
/// what was resolved. Lifted from the design playground's
/// `InventorySyncLedger`, with `InventoryQueuedOperation` replaced by the
/// commands and receipts this package already defines rather than a second,
/// display-only description of the same change.
public struct InventoryReplicaSyncLedger: Hashable, Sendable {
    public let waiting: [InventoryQueuedMutation]
    public let repairs: [InventoryRepair]
    public let resolved: [InventoryResolvedEntry]

    public init(
        waiting: [InventoryQueuedMutation] = [],
        repairs: [InventoryRepair] = [],
        resolved: [InventoryResolvedEntry] = []
    ) {
        self.waiting = waiting
        self.repairs = repairs
        self.resolved = resolved
    }
}

/// One change on this phone the server has not taken yet, in the order the
/// drain will send it (ADR-002's `InventoryQueue.ordered`: enqueue order,
/// corrected so nothing precedes its dependency).
public struct InventoryQueuedMutation: Identifiable, Hashable, Sendable {
    public let receipt: InventoryReceipt
    public let command: InventoryCommand
    public let enqueuedAt: Date
    /// How far through sending it is, while the drain has it in flight.
    public let progress: Double?

    public init(
        receipt: InventoryReceipt, command: InventoryCommand, enqueuedAt: Date,
        progress: Double? = nil
    ) {
        self.receipt = receipt
        self.command = command
        self.enqueuedAt = enqueuedAt
        self.progress = progress
    }

    public var id: String { receipt.mutationId }
}

/// A repair settled, by a person or on its own (an `applied` outcome with
/// `converged: true`).
public struct InventoryResolvedEntry: Identifiable, Hashable, Sendable {
    public let id: String
    public let entityId: String
    public let outcome: String
    public let resolvedAt: Date

    public init(id: String, entityId: String, outcome: String, resolvedAt: Date) {
        self.id = id
        self.entityId = entityId
        self.outcome = outcome
        self.resolvedAt = resolvedAt
    }
}

/// The seam every Inventory feature reads and writes through (ADR-002's iOS
/// replica design). `AppCore` names only this protocol; `InventoryReplica`
/// implements it against a durable GRDB replica, and `AppCoreFakes` carries
/// an in-memory one for tests.
public protocol InventoryStore: Sendable {
    /// Streams a query's current value and every update to it, for as long as
    /// the stream is being read.
    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value>

    /// Applies a command. Returns once the change is durable — after the
    /// server's outcome today, after a local commit once the replica lands —
    /// which is deliberately not something a caller can distinguish.
    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt

    /// Cancels a change that has not left the device, or reverts it with a
    /// compensating event if it has.
    func undo(_ receipt: InventoryReceipt) async throws

    /// Settles an open repair with the person's choice.
    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws

    /// Takes the replica from empty to a current snapshot.
    func download() async throws

    /// Catches the replica up from wherever it last stopped.
    func refresh() async

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data

    /// `PUT /media/:sha256` ahead of `item.attachPhoto` (A22, ADR-002 D9):
    /// stores a photo's bytes, content-addressed by their own hash.
    /// Re-sending bytes already stored answers success
    /// (`alreadyStored: true`) rather than an error, so a caller that lost
    /// the answer to a previous attempt can retry without checking first.
    func uploadPhoto(sha256: String, data: Data, contentType: InventoryMediaContentType)
        async throws -> InventoryMediaUploadResult

    func status() -> AsyncStream<InventoryReplicaStatus>
}
