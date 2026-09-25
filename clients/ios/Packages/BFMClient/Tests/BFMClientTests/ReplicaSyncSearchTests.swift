import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// Search over protocol-2 values as `OnlineInventoryStore` fills the replica
/// through ``BFMInventoryTransport``'s real decodes (POPS-4404): an enum
/// value is found by its option's label and a computed field by its
/// evaluation, after a download, after a refresh that changes either, and
/// after a relaunch.
@Suite("Replica sync through the BFM transport: search", .timeLimit(.minutes(1)))
internal struct ReplicaSyncSearchTests {
    private static let finish = "4b9e2c7d-1a3f-4e58-b6c0-9d7e2f1a3b85"
    private static let matte = "7c1d3e5f-2a4b-4c6d-8e0f-1a2b3c4d5e6f"
    private static let gloss = "8d2e4f60-3b5c-4d7e-9f10-2b3c4d5e6f70"

    private static func catalogue(revision: Int, matteLabel: String = "Satin Matte") -> String {
        let finishField = Protocol2Wire.field(
            id: finish, key: "finish", label: "Finish", kind: "enum", sortOrder: 2,
            enumOptionIds: [matte, gloss], enumOptionLabels: [matteLabel, "High Gloss"])
        return Protocol2Wire.catalogue(
            revision: revision, fields: Protocol2Wire.bulbFields + [finishField])
    }

    /// The lamp with a stored lumens and finish, and a computed efficacy.
    private static func lamp(
        revision: Int = 1, seq: Int = 1, catalogueRevision: Int = 2, finishOption: String = matte,
        efficacy: Int = 4321
    ) -> String {
        InventoryWire.item(
            id: Protocol2Wire.lampId, revision: revision, seq: seq, name: "Lamp",
            typeId: Protocol2Wire.bulbType, catalogueRevision: catalogueRevision,
            fieldValues: """
                [{"fieldId":"\(Protocol2Wire.lumens)","source":"stored",\
                "catalogueRevision":\(catalogueRevision),"values":[{"amount":"800","unit":"lm"}]},\
                {"fieldId":"\(finish)","source":"stored","catalogueRevision":\(catalogueRevision),\
                "values":[{"optionId":"\(finishOption)"}]}]
                """,
            computedValues: """
                [{"fieldId":"\(Protocol2Wire.efficacy)","source":"computed",\
                "catalogueRevision":\(catalogueRevision),"state":"ok","values":[\(efficacy)],\
                "dependencies":[{"itemId":"\(Protocol2Wire.lampId)",\
                "fieldId":"\(Protocol2Wire.lumens)","revision":\(revision)}],\
                "traversedItemIds":["\(Protocol2Wire.lampId)"]}]
                """)
    }

    private static func download(_ harness: ReplicaSyncHarness) async throws {
        await harness.server.set(
            "snapshot",
            .ok(Protocol2Wire.snapshot(items: [lamp()], catalogueRevision: 2)))
        await harness.server.set("catalogue:2", .ok(catalogue(revision: 2)))
        await harness.server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 2)))
        try await harness.store.download()
    }

    /// What the store's own search stream answers first for `text`.
    private static func found(_ text: String, in harness: ReplicaSyncHarness) async -> [String] {
        var results = harness.store.observe(.search(text)).makeAsyncIterator()
        return (await results.next() ?? []).map(\.id)
    }

    /// A feed page moving the replica to revision 3, where the matte option
    /// is relabelled, carrying no item rows.
    private static func scriptRelabel(on server: ScriptedInventoryServer) async {
        await server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 3, nextSince: 12)))
        await server.set("catalogue:3", .ok(catalogue(revision: 3, matteLabel: "Eggshell")))
    }

    @Test("a download finds the lamp by its enum option's label and its computed value")
    func searchAfterDownload() async throws {
        let harness = try ReplicaSyncHarness()

        try await Self.download(harness)

        #expect(await Self.found("satin", in: harness) == [Protocol2Wire.lampId])
        #expect(await Self.found("4321", in: harness) == [Protocol2Wire.lampId])
        #expect(await Self.found("gloss", in: harness).isEmpty)
    }

    @Test("a refreshed value is what the lamp is found by, and the replaced one finds nothing")
    func searchAfterValueRefresh() async throws {
        let harness = try ReplicaSyncHarness()
        try await Self.download(harness)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [
                        Self.lamp(revision: 2, seq: 11, finishOption: Self.gloss, efficacy: 5678)
                    ],
                    catalogueRevision: 2, nextSince: 12)))

        await harness.store.refresh()

        #expect(try harness.replica.syncPosition().since == 12)
        #expect(await Self.found("high gloss", in: harness) == [Protocol2Wire.lampId])
        #expect(await Self.found("5678", in: harness) == [Protocol2Wire.lampId])
        #expect(await Self.found("satin", in: harness).isEmpty)
        #expect(await Self.found("4321", in: harness).isEmpty)
    }

    @Test("a revision that relabels an option re-indexes an item the page did not carry")
    func searchAfterRelabel() async throws {
        let harness = try ReplicaSyncHarness()
        try await Self.download(harness)
        await Self.scriptRelabel(on: harness.server)

        await harness.store.refresh()

        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 3)
        #expect(await Self.found("eggshell", in: harness) == [Protocol2Wire.lampId])
        #expect(await Self.found("satin", in: harness).isEmpty)
        #expect(await Self.found("4321", in: harness) == [Protocol2Wire.lampId])
    }

    @Test("what a refresh indexed is found after a relaunch, and a later refresh re-indexes it")
    func searchAfterRestart() async throws {
        let directory = try ReplicaSyncHarness.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ScriptedInventoryServer()
        do {
            let first = try ReplicaSyncHarness(
                replica: try InventoryReplica(onDiskAt: directory, freeBytes: { _ in .max }),
                server: server)
            try await Self.download(first)
            await Self.scriptRelabel(on: server)
            await first.store.refresh()
        }

        let reopened = try ReplicaSyncHarness(
            replica: try InventoryReplica(onDiskAt: directory, freeBytes: { _ in .max }),
            server: server)

        #expect(await Self.found("eggshell", in: reopened) == [Protocol2Wire.lampId])
        #expect(await Self.found("4321", in: reopened) == [Protocol2Wire.lampId])
        #expect(await Self.found("satin", in: reopened).isEmpty)

        await server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [
                        Self.lamp(
                            revision: 2, seq: 12, catalogueRevision: 3, finishOption: Self.gloss,
                            efficacy: 9753)
                    ], catalogueRevision: 3, nextSince: 13)))
        await reopened.store.refresh()

        #expect(await Self.found("high gloss", in: reopened) == [Protocol2Wire.lampId])
        #expect(await Self.found("9753", in: reopened) == [Protocol2Wire.lampId])
        #expect(await Self.found("eggshell", in: reopened).isEmpty)
    }
}
