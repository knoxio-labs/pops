import AppCore
import Foundation
import InventoryReplica
import Synchronization

@testable import BFMClient

/// A replica and the store that fills it, wired to a ``ScriptedInventoryServer``
/// through the real ``BFMInventoryTransport``.
internal struct ReplicaSyncHarness {
    internal let server: ScriptedInventoryServer
    internal let replica: InventoryReplica
    internal let transport: BFMInventoryTransport
    internal let store: OnlineInventoryStore

    internal init(
        replica: InventoryReplica? = nil,
        server: ScriptedInventoryServer = ScriptedInventoryServer()
    ) throws {
        self.server = server
        self.replica = try replica ?? InventoryReplica()
        transport = try BFMInventoryTransport.stubbed(server.transport)
        store = OnlineInventoryStore(
            replica: self.replica, transport: transport, mintMutationId: Self.mutationIds(),
            now: { Date(timeIntervalSinceReferenceDate: 800_000_000) })
    }

    /// `m1`, `m2`, … in the order they are asked for.
    internal static func mutationIds() -> @Sendable () -> String {
        let next = Mutex(0)
        return {
            next.withLock { count in
                count += 1
                return "m\(count)"
            }
        }
    }

    internal var lamp: InventoryItem? {
        get throws { try replica.read(.item(id: Protocol2Wire.lampId)) }
    }

    internal var status: InventoryReplicaStatus {
        get throws { try replica.read(.replicaStatus) }
    }

    /// Downloads a snapshot of one protocol-2 lamp pinned to `revision`.
    internal func downloadLamp(revision: Int = 2, fields: [String] = Protocol2Wire.bulbFields)
        async throws
    {
        await server.enqueue(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [Protocol2Wire.lamp(catalogueRevision: revision)],
                    catalogueRevision: revision)))
        await server.enqueue(
            "catalogue:\(revision)",
            .ok(Protocol2Wire.catalogue(revision: revision, fields: fields)))
        await server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: revision)))
        try await store.download()
    }

    /// A fresh directory for an on-disk replica.
    internal static func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
            "replica-sync-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
