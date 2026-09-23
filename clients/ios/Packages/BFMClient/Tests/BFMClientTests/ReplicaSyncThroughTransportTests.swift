import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// `OnlineInventoryStore` filling a replica through ``BFMInventoryTransport``'s
/// real decodes (POPS-4404): the pinned protocol-2 catalogue is fetched
/// before the page that names it is applied, and nothing is committed
/// against a revision this phone does not hold or cannot read.
@Suite("Replica sync through the BFM transport", .timeLimit(.minutes(1)))
internal struct ReplicaSyncThroughTransportTests {
    @Test(
        "a protocol-2 snapshot fetches its pinned catalogue first and keeps stored and computed values"
    )
    func snapshotWithPinnedCatalogue() async throws {
        let harness = try ReplicaSyncHarness()

        try await harness.downloadLamp(revision: 2)

        let routes = await harness.server.routes
        let snapshot = try #require(routes.firstIndex(of: "snapshot"))
        let catalogue = try #require(routes.firstIndex(of: "catalogue:2"))
        #expect(snapshot < catalogue)
        let lamp = try #require(try harness.lamp)
        #expect(lamp.catalogueRevision == 2)
        #expect(
            lamp.fieldValues.map(\.fieldId) == [Protocol2Wire.lumens])
        #expect(
            lamp.fieldValues.first?.state
                == .value([.measurement(amount: try InventoryDecimal("800"), unit: "lm")]))
        #expect(lamp.computedValues.map(\.fieldId) == [Protocol2Wire.efficacy])
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 2)
        #expect(try harness.replica.catalogue(revision: 2)?.types.first?.fields.count == 2)
    }

    @Test("a feed page that names a newer revision applies its rows against that revision")
    func changesWithNewRevision() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 3)],
                    catalogueRevision: 3, nextSince: 12)))
        await harness.server.set(
            "catalogue:3",
            .ok(Protocol2Wire.catalogue(revision: 3, fields: Protocol2Wire.renamedFields)))

        await harness.store.refresh()

        #expect(try harness.lamp?.catalogueRevision == 3)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 3)
        #expect(try harness.replica.syncPosition().since == 12)
        let label = try harness.replica.catalogue(revision: 3)?.types.first?.fields.first?.label
        #expect(label == "Brightness")
    }

    @Test("a catalogue that cannot be fetched applies nothing, and the next refresh catches up")
    func failedCatalogueFetch() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 3)],
                    catalogueRevision: 3, nextSince: 12)))
        await harness.server.set(
            "catalogue:3", ScriptedReply(status: .serviceUnavailable, json: "{}"))

        await harness.store.refresh()

        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.lamp?.catalogueRevision == 2)
        #expect(try harness.replica.syncPosition().since == 11)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 2)
        guard case .offline = try harness.status else {
            Issue.record("expected offline, got \(try harness.status)")
            return
        }

        await harness.server.set(
            "catalogue:3",
            .ok(Protocol2Wire.catalogue(revision: 3, fields: Protocol2Wire.renamedFields)))
        await harness.store.refresh()

        #expect(try harness.lamp?.revision == 2)
        #expect(try harness.replica.syncPosition().since == 12)
        #expect(try harness.status == .current)
    }

    @Test("a page naming a newer revision than the one the server hands back applies nothing")
    func catalogueRevisionRace() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 4)],
                    catalogueRevision: 4, nextSince: 12)))
        await harness.server.set("catalogue:4", .ok(Protocol2Wire.catalogue(revision: 3)))

        await harness.store.refresh()

        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.replica.syncPosition().since == 11)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 2)
        #expect(try harness.replica.catalogue(revision: 3) == nil)

        await harness.server.set("catalogue:4", .ok(Protocol2Wire.catalogue(revision: 4)))
        await harness.store.refresh()

        #expect(try harness.lamp?.catalogueRevision == 4)
        #expect(try harness.replica.syncPosition().since == 12)
    }

    @Test("an interrupted snapshot resumes from its cursor once the catalogue can be fetched")
    func interruptedSnapshotRetries() async throws {
        let harness = try ReplicaSyncHarness()
        await harness.server.enqueue(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [Protocol2Wire.lamp()], catalogueRevision: 2, nextCursor: nil)))
        await harness.server.set(
            "catalogue:2", ScriptedReply(status: .serviceUnavailable, json: "{}"))

        await #expect(throws: (any Error).self) { try await harness.store.download() }
        #expect(try harness.lamp == nil)
        #expect(try harness.replica.syncPosition().since == nil)

        await harness.server.set("catalogue:2", .ok(Protocol2Wire.catalogue(revision: 2)))
        await harness.server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 2)))
        try await harness.store.download()

        #expect(try harness.lamp?.catalogueRevision == 2)
        #expect(try harness.replica.syncPosition().since == 11)
    }

    @Test("a replica opened again from disk keeps its rows, values, catalogue and cursor")
    func restartPersistence() async throws {
        let directory = try ReplicaSyncHarness.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ScriptedInventoryServer()
        do {
            let first = try ReplicaSyncHarness(
                replica: try InventoryReplica(onDiskAt: directory, freeBytes: { _ in .max }),
                server: server)
            try await first.downloadLamp(revision: 2)
        }

        let reopened = try ReplicaSyncHarness(
            replica: try InventoryReplica(onDiskAt: directory, freeBytes: { _ in .max }),
            server: server)

        let lamp = try #require(try reopened.lamp)
        #expect(lamp.catalogueRevision == 2)
        #expect(lamp.fieldValues.map(\.fieldId) == [Protocol2Wire.lumens])
        #expect(lamp.computedValues.map(\.fieldId) == [Protocol2Wire.efficacy])
        #expect(try reopened.replica.syncPosition().since == 11)
        #expect(try reopened.replica.syncPosition().storedCatalogueRevision == 2)

        let snapshotsBefore = await server.count("snapshot")
        await server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 12, amount: "900")],
                    catalogueRevision: 2, nextSince: 12)))
        await reopened.store.refresh()

        #expect(await server.count("snapshot") == snapshotsBefore)
        #expect(
            try reopened.lamp?.fieldValues.first?.state
                == .value([.measurement(amount: try InventoryDecimal("900"), unit: "lm")]))
        #expect(try reopened.replica.syncPosition().since == 12)
    }
}
