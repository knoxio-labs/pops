import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// A `409 resync_required` answered through ``BFMInventoryTransport``
/// (POPS-4404): the replica the phone holds is replaced only in the
/// transaction that stores the fresh snapshot's first page, so a resync the
/// network or the catalogue interrupts leaves the last usable replica, and
/// its search index, in place.
@Suite("Replica sync through the BFM transport: resync", .timeLimit(.minutes(1)))
internal struct ReplicaResyncThroughTransportTests {
    private static let shadeId = "0b7e4d2a-3c9f-4a18-b6e5-7d2c1f0a9e83"
    private static let resyncRequired = ScriptedReply(
        status: .conflict, json: InventoryWire.failure(code: "resync_required"))
    private static let unavailable = ScriptedReply(status: .serviceUnavailable, json: "{}")

    /// A downloaded replica holding the lamp and a shade at revision 2.
    private static func downloaded() async throws -> ReplicaSyncHarness {
        let harness = try ReplicaSyncHarness()
        await harness.server.set(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [
                        Protocol2Wire.lamp(),
                        Protocol2Wire.lamp(id: shadeId, amount: "450", name: "Shade"),
                    ], catalogueRevision: 2)))
        await harness.server.set("catalogue:2", .ok(Protocol2Wire.catalogue(revision: 2)))
        await harness.server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 2)))
        try await harness.store.download()
        return harness
    }

    private static func expectKept(_ harness: ReplicaSyncHarness) throws {
        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.replica.read(.item(id: shadeId))?.name == "Shade")
        #expect(try harness.replica.ids(.search("shade")) == [shadeId])
        #expect(try harness.replica.syncPosition().since == 11)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 2)
    }

    @Test("a resync whose snapshot cannot be fetched keeps every row, the index and the cursor")
    func unreachableSnapshotKeepsReplica() async throws {
        let harness = try await Self.downloaded()
        await harness.server.set("changes", Self.resyncRequired)
        await harness.server.set("snapshot", Self.unavailable)

        await harness.store.refresh()

        try Self.expectKept(harness)
        guard case .offline = try harness.status else {
            Issue.record("expected offline, got \(try harness.status)")
            return
        }
    }

    @Test("a resync whose pinned catalogue cannot be fetched keeps every row and the cursor")
    func unreachableCatalogueKeepsReplica() async throws {
        let harness = try await Self.downloaded()
        await harness.server.set("changes", Self.resyncRequired)
        await harness.server.set(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 12, catalogueRevision: 3)],
                    catalogueRevision: 3, highWaterSeq: 12)))
        await harness.server.set("catalogue:3", Self.unavailable)

        await harness.store.refresh()

        try Self.expectKept(harness)
        #expect(try harness.replica.catalogue(revision: 3) == nil)
    }

    @Test("a resync over two pages discards the old rows once, keeping its own first page")
    func pagedResyncKeepsFirstPage() async throws {
        let harness = try await Self.downloaded()
        await harness.server.set(
            "changes", Self.resyncRequired,
            .ok(Protocol2Wire.changes(catalogueRevision: 2, nextSince: 12)))
        await harness.server.set(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 12)], catalogueRevision: 2,
                    highWaterSeq: 12, nextCursor: "page-2")),
            .ok(
                Protocol2Wire.snapshot(
                    items: [
                        Protocol2Wire.lamp(id: Self.shadeId, revision: 2, seq: 12, name: "Blind")
                    ],
                    catalogueRevision: 2, highWaterSeq: 12)))

        await harness.store.refresh()

        #expect(try harness.lamp?.revision == 2)
        #expect(try harness.replica.read(.item(id: Self.shadeId))?.name == "Blind")
        #expect(try harness.replica.ids(.search("blind")) == [Self.shadeId])
        #expect(try harness.replica.syncPosition().since == 12)
    }

    @Test("an interrupted resync completes on the next refresh and drops rows the server lost")
    func interruptedResyncCompletesLater() async throws {
        let harness = try await Self.downloaded()
        await harness.server.set("changes", Self.resyncRequired)
        await harness.server.set("snapshot", Self.unavailable)
        await harness.store.refresh()
        try Self.expectKept(harness)

        await harness.server.set(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 12)], catalogueRevision: 2,
                    highWaterSeq: 12)))
        await harness.server.set(
            "changes", Self.resyncRequired,
            .ok(Protocol2Wire.changes(catalogueRevision: 2, nextSince: 12)))
        await harness.store.refresh()

        #expect(try harness.lamp?.revision == 2)
        #expect(try harness.replica.read(.item(id: Self.shadeId)) == nil)
        #expect(try harness.replica.ids(.search("shade")).isEmpty)
        #expect(try harness.replica.syncPosition().since == 12)
        #expect(try harness.status == .current)
    }
}

extension InventoryReplica {
    fileprivate func ids(_ query: InventoryQuery<[InventoryItem]>) throws -> [String] {
        try read(query).map(\.id)
    }
}
