import AppCore
import AppCoreFakes
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// A drain whose backoff never elapses on its own, so only the store's own
/// requests start a pass.
private struct ParkedDrainClock: InventoryDrainClock {
    func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: .seconds(86_400))
    }
}

/// The local-first store over a scripted BFM: changes are logged on the
/// phone and replayed by the drain through the real transport.
private struct LocalFirstHarness {
    let server = ScriptedInventoryServer()
    let replica: InventoryReplica
    let reachability: ScriptedNetworkReachability
    let store: LocalFirstInventoryStore

    init(online: Bool = true) throws {
        replica = try InventoryReplica()
        reachability = ScriptedNetworkReachability(satisfied: online)
        store = LocalFirstInventoryStore(
            replica: replica, transport: try BFMInventoryTransport.stubbed(server.transport),
            mintMutationId: ReplicaSyncHarness.mutationIds(),
            now: { Date(timeIntervalSinceReferenceDate: 800_000_000) },
            reachability: reachability, drainClock: ParkedDrainClock())
    }

    /// The lamp downloaded at catalogue revision 2.
    func downloadLamp() async throws {
        await server.enqueue(
            "snapshot",
            .ok(Protocol2Wire.snapshot(items: [Protocol2Wire.lamp()], catalogueRevision: 2)))
        await server.set("catalogue:2", .ok(Protocol2Wire.catalogue(revision: 2)))
        await server.set("changes", .ok(Protocol2Wire.changes(catalogueRevision: 2)))
        try await store.download()
    }

    /// Publishes revision 3 with `fields`: the next feed page announces it.
    func publish(revision: Int, fields: [String], minimumProtocol: Int = 2) async {
        await server.set(
            "catalogue:\(revision)",
            .ok(
                Protocol2Wire.catalogue(
                    revision: revision, minimumProtocol: minimumProtocol, fields: fields)))
        await server.set(
            "changes", .ok(Protocol2Wire.changes(catalogueRevision: revision, nextSince: 12)))
    }

    var ledger: InventoryReplicaSyncLedger {
        get throws { try replica.read(.syncLedger) }
    }

    static func editLumens() throws -> InventoryCommand {
        .editProtocol2Item(
            id: Protocol2Wire.lampId, catalogueRevision: 2,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: Protocol2Wire.lumens,
                    values: [.measurement(amount: try InventoryDecimal("900"), unit: "lm")])
            ])
    }
}

private func applied(_ sent: [SentMutation]) -> String {
    InventoryWire.mutationsResponse(
        sent.map { InventoryWire.appliedOutcome(mutationId: $0.mutationId, revision: 2, seq: 12) }
            .joined(separator: ","))
}

private func rejected(_ sent: [SentMutation], reason: String) -> String {
    InventoryWire.mutationsResponse(
        sent.map { InventoryWire.rejectedOutcome(mutationId: $0.mutationId, reason: reason) }
            .joined(separator: ","))
}

/// POPS-4405: a change keeps the catalogue revision it was authored against
/// all the way to the server, and the server's `catalogue_update_required`
/// and `catalogue_repair_required` answers each lead somewhere a person can
/// act on, through the BFM transport's real encoding and decoding.
@Suite("Catalogue revisions across replay", .timeLimit(.minutes(1)))
internal struct CatalogueRevisionReplayTests {
    @Test(
        "a change queued at N replays at N after N+1 renames a field, and the server's rebase applies it"
    )
    func compatibleRenameReplays() async throws {
        let harness = try LocalFirstHarness(online: false)
        try await harness.downloadLamp()
        await harness.server.onMutations { applied($0) }
        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.publish(revision: 3, fields: Protocol2Wire.renamedFields)
        await harness.store.refresh()
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 3)

        harness.reachability.set(true)
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.map(\.mutationId) == ["m1"])
        #expect(sent.map(\.catalogueRevision) == [2])
        #expect(try harness.ledger.waiting.isEmpty)
        #expect(try harness.ledger.repairs.isEmpty)
    }

    @Test(
        "update required: the drain refreshes, moves the change onto N+1 under a new id, and it applies"
    )
    func updateRequiredRefreshesThenRetries() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp()
        await harness.publish(revision: 3, fields: Protocol2Wire.renamedFields)
        await harness.server.onMutations { sent in
            sent.allSatisfy { $0.catalogueRevision == 3 }
                ? applied(sent) : rejected(sent, reason: "catalogue_update_required")
        }

        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.map(\.mutationId) == ["m1", "m2"])
        #expect(sent.map(\.catalogueRevision) == [2, 3])
        #expect(sent.map(\.op) == ["item.edit", "item.edit"])
        #expect(try harness.ledger.waiting.isEmpty)
        #expect(try harness.ledger.repairs.isEmpty)
    }

    @Test(
        "update required and N+1 replaced the field: the change opens the catalogue repair, unsent")
    func updateRequiredWithReplacedFieldOpensRepair() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp()
        await harness.publish(revision: 3, fields: Protocol2Wire.replacedFields)
        await harness.server.onMutations { rejected($0, reason: "catalogue_update_required") }

        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.store.synchronize()

        #expect(await harness.server.mutations.map(\.mutationId) == ["m1"])
        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .catalogueChanged)
        #expect(repair.entityId == Protocol2Wire.lampId)
        #expect(try harness.ledger.waiting.isEmpty)
    }

    @Test(
        "update required and N+1 records a replacement for the field: the change moves onto it and is sent"
    )
    func updateRequiredMovesOntoRecordedReplacement() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp()
        await harness.publish(revision: 3, fields: Protocol2Wire.lineageFields)
        await harness.server.onMutations { sent in
            sent.allSatisfy { $0.catalogueRevision == 3 }
                ? applied(sent) : rejected(sent, reason: "catalogue_update_required")
        }

        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.map(\.mutationId) == ["m1", "m2"])
        #expect(sent.map(\.catalogueRevision) == [2, 3])
        #expect(sent.first?.args.contains(Protocol2Wire.lumens) == true)
        #expect(sent.last?.args.contains(Protocol2Wire.brightness) == true)
        #expect(sent.last?.args.contains(Protocol2Wire.lumens) == false)
        #expect(try harness.ledger.waiting.isEmpty)
        #expect(try harness.ledger.repairs.isEmpty)
    }

    @Test(
        "repair required from the server opens the catalogue repair, which retries once the field is back"
    )
    func repairRequiredThenRetry() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp()
        await harness.publish(revision: 3, fields: Protocol2Wire.replacedFields)
        await harness.server.onMutations { rejected($0, reason: "catalogue_repair_required") }

        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.store.synchronize()

        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .catalogueChanged)

        await #expect(throws: InventoryCommandError.self) {
            try await harness.store.resolve(repair.id, with: .keepMine())
        }
        #expect(try harness.ledger.repairs.map(\.id) == [repair.id])

        await harness.publish(revision: 4, fields: Protocol2Wire.renamedFields)
        await harness.server.onMutations { applied($0) }
        await harness.store.refresh()
        try await harness.store.resolve(repair.id, with: .keepMine())
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.last?.catalogueRevision == 4)
        #expect(sent.last?.mutationId != repair.id)
        #expect(try harness.ledger.repairs.isEmpty)
        #expect(try harness.ledger.resolved.first?.outcome == "Sent with current fields")
    }

    @Test(
        "update required while the new catalogue needs a newer app: blocked, the change keeps waiting"
    )
    func updateRequiredWhenAppTooOld() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp()
        await harness.publish(revision: 3, fields: Protocol2Wire.renamedFields, minimumProtocol: 3)
        await harness.server.onMutations { rejected($0, reason: "catalogue_update_required") }

        _ = try await harness.store.perform(try LocalFirstHarness.editLumens())
        await harness.store.synchronize()

        #expect(try harness.replica.read(.replicaStatus) == .blocked(reason: .appTooOld))
        #expect(await harness.server.mutations.map(\.mutationId) == ["m1"])
        #expect(try harness.ledger.waiting.map(\.receipt.mutationId) == ["m2"])
        #expect(try harness.ledger.repairs.isEmpty)
    }
}
