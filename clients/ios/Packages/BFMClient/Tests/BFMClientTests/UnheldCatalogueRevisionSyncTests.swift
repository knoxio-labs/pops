import AppCore
import InventoryReplica
import Testing

@testable import BFMClient

/// POPS-4510: a publication leaves an unchanged item's values at the
/// revision they were written under, so a page can carry values naming
/// revisions older than the one it pins. The phone fetches each such revision
/// it lacks before applying the page, through the real transport, and stores
/// it in the page's transaction.
@Suite("Sync fetches every catalogue revision a page's values name", .timeLimit(.minutes(1)))
internal struct UnheldCatalogueRevisionSyncTests {
    private static let shadeId = "0b7e4d2a-3c9f-4a18-b6e5-7d2c1f0a9e83"
    private static let bulbId = "9f2c6b1d-8e4a-4f37-a5d0-3b1e7c9a2d64"

    private static func lumens(_ item: InventoryItem?) -> InventoryItemFieldEntry? {
        item?.fieldValues.first { $0.fieldId == Protocol2Wire.lumens && $0.source == .stored }
    }

    private static func measurement(_ amount: String) throws -> InventoryFieldValueState {
        .value([.measurement(amount: try InventoryDecimal(amount), unit: "lm")])
    }

    private static func serveRevisions(
        _ revisions: ClosedRange<Int>, on harness: ReplicaSyncHarness
    ) async {
        for revision in revisions {
            await harness.server.set(
                "catalogue:\(revision)", .ok(Protocol2Wire.catalogue(revision: revision)))
        }
    }

    /// A first snapshot pinned to revision 3 whose items were written at 1, 2 and 3.
    private static func scriptSpanningSnapshot(on harness: ReplicaSyncHarness) async {
        await harness.server.set(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [
                        Protocol2Wire.lamp(catalogueRevision: 1, amount: "800"),
                        Protocol2Wire.lamp(
                            id: shadeId, catalogueRevision: 2, amount: "450", name: "Shade"),
                        Protocol2Wire.lamp(
                            id: bulbId, catalogueRevision: 3, amount: "1200", name: "Bulb"),
                    ], catalogueRevision: 3)))
        await harness.server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 3)))
    }

    @Test("a fresh install whose items span revisions 1 to 3, pinned at 3, downloads typed values")
    func freshInstallSpanningRevisions() async throws {
        let harness = try ReplicaSyncHarness()
        await Self.scriptSpanningSnapshot(on: harness)
        await Self.serveRevisions(1...3, on: harness)

        try await harness.store.download()

        let lamp = Self.lumens(try harness.lamp)
        #expect(lamp?.state == (try Self.measurement("800")))
        #expect(lamp?.catalogueRevision == 1)
        let shade = Self.lumens(try harness.replica.read(.item(id: Self.shadeId)))
        #expect(shade?.state == (try Self.measurement("450")))
        #expect(shade?.catalogueRevision == 2)
        let bulb = Self.lumens(try harness.replica.read(.item(id: Self.bulbId)))
        #expect(bulb?.state == (try Self.measurement("1200")))
        for revision in 1...3 {
            #expect(
                try harness.replica.catalogue(revision: revision) != nil, "revision \(revision)")
        }
        #expect(await harness.server.count("catalogue:1") == 1)
        #expect(await harness.server.count("catalogue:2") == 1)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 3)
    }

    @Test("a revision the server cannot serve applies nothing, and a later sync completes")
    func unservableRevisionAppliesNothingThenRetries() async throws {
        let harness = try ReplicaSyncHarness()
        await Self.scriptSpanningSnapshot(on: harness)
        await Self.serveRevisions(2...3, on: harness)

        await #expect(throws: RepositoryError.unavailable) {
            try await harness.store.download()
        }

        #expect(try harness.lamp == nil)
        #expect(try harness.replica.read(.item(id: Self.bulbId)) == nil)
        #expect(try harness.replica.catalogue(revision: 2) == nil)
        #expect(try harness.replica.catalogue(revision: 3) == nil)
        #expect(try harness.replica.syncPosition().since == nil)
        #expect(await harness.server.count("changes") == 0)

        await Self.serveRevisions(1...1, on: harness)
        try await harness.store.download()

        #expect(Self.lumens(try harness.lamp)?.state == (try Self.measurement("800")))
        #expect(try harness.replica.catalogue(revision: 1) != nil)
    }

    @Test("a revision fetch answered with another revision is a mismatch and stores nothing")
    func wrongRevisionAnswerAppliesNothing() async throws {
        let harness = try ReplicaSyncHarness()
        await Self.scriptSpanningSnapshot(on: harness)
        await Self.serveRevisions(2...3, on: harness)
        await harness.server.set("catalogue:1", .ok(Protocol2Wire.catalogue(revision: 2)))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await harness.store.download()
        }

        #expect(await harness.server.count("catalogue:1") == 1)
        #expect(try harness.lamp == nil)
        #expect(try harness.replica.catalogue(revision: 3) == nil)
    }

    @Test("a feed page carrying an item at a skipped revision fetches it before applying")
    func feedPageFetchesSkippedRevision() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 3)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [
                        Protocol2Wire.lamp(
                            id: Self.shadeId, seq: 11, catalogueRevision: 1, amount: "450",
                            name: "Shade")
                    ], catalogueRevision: 3, nextSince: 12)))
        await Self.serveRevisions(1...1, on: harness)

        try await harness.store.download()

        let shade = Self.lumens(try harness.replica.read(.item(id: Self.shadeId)))
        #expect(shade?.state == (try Self.measurement("450")))
        #expect(shade?.catalogueRevision == 1)
        #expect(await harness.server.count("catalogue:1") == 1)
        #expect(await harness.server.count("catalogue:2") == 0)
    }

    @Test("a page whose values name only held revisions fetches nothing but its pinned one")
    func heldRevisionsAreNotFetchedAgain() async throws {
        let harness = try ReplicaSyncHarness()
        await Self.scriptSpanningSnapshot(on: harness)
        await Self.serveRevisions(1...3, on: harness)
        try await harness.store.download()
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [
                        Protocol2Wire.lamp(
                            revision: 2, seq: 11, catalogueRevision: 1, amount: "900"),
                        Protocol2Wire.lamp(
                            id: Self.shadeId, revision: 2, seq: 12, catalogueRevision: 2,
                            amount: "500",
                            name: "Shade"),
                    ], catalogueRevision: 3, nextSince: 13)))

        try await harness.store.download()

        #expect(Self.lumens(try harness.lamp)?.state == (try Self.measurement("900")))
        #expect(await harness.server.count("catalogue:1") == 1)
        #expect(await harness.server.count("catalogue:2") == 1)
    }
}
