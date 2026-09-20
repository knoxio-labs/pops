import AppCore
import Foundation
import InventoryReplica

/// A paired device's Inventory when the phone had no room to open its
/// replica: reads answer from an empty, in-memory replica (so the screens
/// show the first-launch Download rather than "not available"), and every
/// write, Download included, throws `InventoryStorageError.full`, which the
/// screens show as the Storage full interruption. Nothing is kept in memory
/// in place of the disk, because a change that silently vanished on the next
/// launch would be worse than one refused now.
internal struct StorageFullInventoryStore: InventoryStore {
    private let reads: any InventoryStore

    internal init(transport: any InventorySyncTransport) {
        if let replica = try? InventoryReplica() {
            reads = OnlineInventoryStore(replica: replica, transport: transport)
        } else {
            reads = UnboundInventoryStore()
        }
    }

    internal func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        reads.observe(query)
    }

    internal func status() -> AsyncStream<InventoryReplicaStatus> {
        reads.status()
    }

    internal func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw InventoryStorageError.full
    }

    internal func undo(_ receipt: InventoryReceipt) async throws {
        throw InventoryStorageError.full
    }

    internal func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        throw InventoryStorageError.full
    }

    internal func download() async throws {
        throw InventoryStorageError.full
    }

    internal func refresh() async {}

    internal func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await reads.photo(sha256, variant: variant)
    }

    internal func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        throw InventoryStorageError.full
    }

    internal func discardPhoto(_ sha256: String) async throws {
        throw InventoryStorageError.full
    }

    internal func settleTypeArrival(typeKey: String) async throws {
        throw InventoryStorageError.full
    }
}
