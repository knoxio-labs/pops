import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// POPS-4403: every protocol-2 value the inventory pillar's command engine
/// wrote (`Contracts/value-vectors-v1.json`) travels as the pillar projected
/// it through the BFM transport's generated decode into the replica, reads
/// back as its catalogue field's kind, and goes back to the server through
/// the real commands and drain exactly as the engine accepted it.
@Suite("Protocol-2 value vectors through the transport and the replica", .timeLimit(.minutes(1)))
internal struct ValueVectorRoundTripTests {
    private typealias File = ValueVectorFile
    private typealias Expect = ValueVectorExpectations

    /// Downloads every vector row. The replay pins the revision the engine
    /// wrote the values against, since a create names the active revision.
    private static func downloaded(online: Bool = true, pinningLive: Bool = false) async throws
        -> (LocalFirstHarness, File)
    {
        let file = try File.load()
        let harness = try LocalFirstHarness(online: online)
        try await ValueVectorPages(file: file).serve(
            harness.server, pinning: pinningLive ? file.liveRevision : file.currentRevision)
        try await harness.store.download()
        return (harness, file)
    }

    private static func item(_ harness: LocalFirstHarness, _ vector: [String: Any]) throws
        -> InventoryItem
    {
        let id = try File.require(vector["itemId"] as? String, "itemId")
        return try File.require(try harness.replica.read(.item(id: id)), "item \(id)")
    }

    private static func storedValues(_ item: InventoryItem, fieldId: String) throws
        -> [InventoryPrimitiveValue]
    {
        let entry = item.fieldValues.first { $0.fieldId == fieldId && $0.source == .stored }
        guard case .value(let values)? = entry?.state else {
            throw File.Missing(description: "a stored value for \(fieldId)")
        }
        return values
    }

    @Test(
        "every vector reads back as its catalogue field's kind, in order, with its target's state")
    func everyVectorReadsBack() async throws {
        let (harness, file) = try await Self.downloaded()
        #expect(file.vectors.count == 35)

        for vector in file.vectors {
            let name = try File.require(vector["name"] as? String, "name")
            let fieldId = try File.require(vector["fieldId"] as? String, "fieldId")
            let kind = try Expect.kind(vector)
            let item = try Self.item(harness, vector)
            if let computed = vector["computedValue"] as? [String: Any] {
                let held = item.computedValues.first { $0.fieldId == fieldId }
                #expect(
                    held?.evaluation == (try Expect.evaluation(computed, kind: kind)), "\(name)")
                #expect(held?.missingInputs == (try Expect.missingInputs(computed)), "\(name)")
            } else if let stored = vector["fieldValue"] as? [String: Any] {
                #expect(
                    try Self.storedValues(item, fieldId: fieldId)
                        == (try Expect.primitives(stored["values"], kind: kind)), "\(name)")
            } else {
                #expect(!item.fieldValues.contains { $0.fieldId == fieldId }, "\(name)")
            }
        }
    }

    @Test("a value read back is sent back exactly as the engine accepted it")
    func readBackValuesReplayThroughTheDrain() async throws {
        let (harness, file) = try await Self.downloaded(online: false, pinningLive: true)
        let replay = try ValueVectorReplay(file: file, replica: harness.replica)
        await harness.server.onMutations { sent in
            InventoryWire.mutationsResponse(
                sent.map { InventoryWire.appliedOutcome(mutationId: $0.mutationId) }
                    .joined(separator: ","))
        }

        for command in replay.commands {
            _ = try await harness.store.perform(command)
        }
        harness.reachability.set(true)
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.count == replay.expected.count)
        for (mutation, expected) in zip(sent, replay.expected) {
            #expect(mutation.op == expected.op, "\(expected.name)")
            #expect(mutation.catalogueRevision == expected.catalogueRevision, "\(expected.name)")
            #expect(mutation.args == expected.args, "\(expected.name)")
        }
        #expect(try harness.ledger.repairs.isEmpty)
    }

    @Test("a stored value the producer refuses for its kind refuses the page", arguments: 0..<22)
    func malformedValueRefusesPage(_ index: Int) async throws {
        let file = try File.load()
        let malformed = file.negatives("malformed_value")
        #expect(malformed.count == 22)
        let vector = try File.require(
            malformed.indices.contains(index) ? malformed[index] : nil, "case")
        let host = try File.object(file.vectors.first?["item"])
        var item = host
        item["fieldValues"] = [try File.object(vector["fieldValue"])]
        item["computedValues"] = [Any]()
        let harness = try LocalFirstHarness()
        await harness.server.enqueue(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: [try File.json(item)], catalogueRevision: file.currentRevision)))
        for revision in [file.liveRevision, file.currentRevision] {
            await harness.server.set(
                "catalogue:\(revision)", .ok(try file.catalogueJSON(revision: revision)))
        }

        await #expect(throws: RepositoryError.contractMismatch, "\(vector["name"] ?? index)") {
            try await harness.store.download()
        }
        let id = try File.require(host["id"] as? String, "item id")
        #expect(try harness.replica.read(.item(id: id)) == nil)
    }
}
