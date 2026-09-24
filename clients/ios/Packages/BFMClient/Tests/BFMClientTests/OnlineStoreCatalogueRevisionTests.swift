import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

private func applied(_ sent: [SentMutation]) -> String {
    InventoryWire.mutationsResponse(
        sent.map { InventoryWire.appliedOutcome(mutationId: $0.mutationId, revision: 2, seq: 12) }
            .joined(separator: ","))
}

private func updateRequired(_ sent: [SentMutation]) -> String {
    InventoryWire.mutationsResponse(
        sent.map {
            InventoryWire.rejectedOutcome(
                mutationId: $0.mutationId, reason: "catalogue_update_required")
        }.joined(separator: ","))
}

/// `OnlineInventoryStore.perform(_:)` sends the catalogue revision a command
/// was authored against, never one nobody saw (POPS-4405), through the real
/// mutation encoding.
@Suite("Online store: catalogue revision on writes", .timeLimit(.minutes(1)))
internal struct OnlineStoreCatalogueRevisionTests {
    private static func editLumens() throws -> InventoryCommand {
        .editProtocol2Item(
            id: Protocol2Wire.lampId, catalogueRevision: 2,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: Protocol2Wire.lumens,
                    values: [.measurement(amount: try InventoryDecimal("900"), unit: "lm")])
            ])
    }

    /// A replica downloaded from a server with no protocol-2 catalogue.
    private static func legacyHarness() async throws -> ReplicaSyncHarness {
        let harness = try ReplicaSyncHarness()
        await harness.server.enqueue(
            "snapshot",
            .ok(InventoryWire.snapshot(items: [InventoryWire.item(id: "lamp", legacyType: "bulb")]))
        )
        await harness.server.set("types", .ok(InventoryWire.catalogue()))
        await harness.server.set("changes", .ok(InventoryWire.changes()))
        try await harness.store.download()
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == nil)
        return harness
    }

    @Test(
        "a protocol-2 edit carries the revision it was authored at, not the one the replica holds now"
    )
    func authoredRevisionIsSent() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes", .ok(Protocol2Wire.changes(catalogueRevision: 3, nextSince: 12)))
        await harness.server.set(
            "catalogue:3",
            .ok(Protocol2Wire.catalogue(revision: 3, fields: Protocol2Wire.renamedFields)))
        await harness.store.refresh()
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 3)
        await harness.server.onMutations { applied($0) }

        _ = try await harness.store.perform(try Self.editLumens())

        #expect(await harness.server.mutations.map(\.catalogueRevision) == [2])
    }

    @Test("a legacy command on a replica with no catalogue revision sends none, not revision 1")
    func noRevisionIsInvented() async throws {
        let harness = try await Self.legacyHarness()
        await harness.server.onMutations { applied($0) }

        _ = try await harness.store.perform(.setItemQuantity(id: "lamp", quantity: 3))

        let sent = await harness.server.mutations
        #expect(sent.map(\.mutationId) == ["m1"])
        #expect(sent.map(\.catalogueRevision) == [nil])
    }

    @Test("an override with no catalogue revision on the phone is refused before anything is sent")
    func overrideWithoutRevisionFails() async throws {
        let harness = try await Self.legacyHarness()
        await harness.server.onMutations { applied($0) }

        await #expect(
            throws: InventoryCommandError.rejected(
                reason: .catalogueUpdateRequired,
                message: "no catalogue revision is on this phone; refresh and try again")
        ) {
            _ = try await harness.store.perform(
                .setComputedOverride(
                    id: "lamp", fieldId: Protocol2Wire.efficacy,
                    value: .integer(
                        try InventoryInteger(80))))
        }
        #expect(await harness.server.mutations.isEmpty)
    }

    @Test(
        "update required: the store refreshes and sends the command once more at the newer revision"
    )
    func updateRequiredRetriesAtNewerRevision() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes", .ok(Protocol2Wire.changes(catalogueRevision: 3, nextSince: 12)))
        await harness.server.set(
            "catalogue:3",
            .ok(Protocol2Wire.catalogue(revision: 3, fields: Protocol2Wire.renamedFields)))
        await harness.server.onMutations { sent in
            sent.allSatisfy { $0.catalogueRevision == 3 } ? applied(sent) : updateRequired(sent)
        }

        let receipt = try await harness.store.perform(try Self.editLumens())

        let sent = await harness.server.mutations
        #expect(sent.map(\.mutationId) == ["m1", "m2"])
        #expect(sent.map(\.catalogueRevision) == [2, 3])
        #expect(receipt.mutationId == "m2")
    }

    @Test("update required with nothing newer to move to is thrown after one send")
    func updateRequiredWithoutNewerRevisionThrows() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.onMutations { updateRequired($0) }

        await #expect(throws: InventoryCommandError.self) {
            _ = try await harness.store.perform(try Self.editLumens())
        }
        #expect(await harness.server.mutations.map(\.mutationId) == ["m1"])
    }
}

/// ``BFMInventoryTransport/syncReadFailure(_:operation:)``: a success this
/// build cannot decode is "too old", never "offline".
@Suite("BFMInventoryTransport undecodable sync reads")
internal struct InventorySyncReadFailureTests {
    @Test("a snapshot the server answered but this build cannot decode is client-too-old")
    func undecodableSnapshot() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"epoch":"e","items":"not a list"}"#))

        await #expect(throws: InventorySyncTransportError.clientTooOld) {
            _ = try await transport.fetchSnapshot(cursor: nil, limit: 10)
        }
    }

    @Test("a feed page the server answered but this build cannot decode is client-too-old")
    func undecodableChanges() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: #"{"epoch":"e"}"#))

        await #expect(throws: InventorySyncTransportError.clientTooOld) {
            _ = try await transport.fetchChanges(since: 1, epoch: "e", limit: 10)
        }
    }

    @Test("an undecodable error body keeps its status's reading")
    func undecodableFailureKeepsItsStatus() async throws {
        let transport = try BFMInventoryTransport.stubbed(
            StubTransport(status: .serviceUnavailable, json: "<html>down</html>"))

        await #expect(throws: RepositoryError.unavailable) {
            _ = try await transport.fetchCatalogue(revision: 2)
        }
    }
}
