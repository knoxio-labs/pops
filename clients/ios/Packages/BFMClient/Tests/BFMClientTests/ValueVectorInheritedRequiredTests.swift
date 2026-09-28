import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

@Suite("Value vectors: inherited required fields", .timeLimit(.minutes(1)))
internal struct ValueVectorInheritedRequiredTests {
    private typealias File = ValueVectorFile

    private static func downloaded() async throws -> (LocalFirstHarness, File) {
        let file = try File.load()
        let harness = try LocalFirstHarness(online: false)
        try await ValueVectorPages(file: file).serve(
            harness.server, pinning: file.liveRevision)
        try await harness.store.download()
        return (harness, file)
    }

    private static func createCommand(from vector: [String: Any]) throws -> InventoryCommand {
        let command = try File.object(vector["command"])
        let args = try File.object(command["args"])
        let item = try File.object(args["item"])
        let rawValues = try File.require(item["values"] as? [Any], "values")
        let values = try rawValues.map { rawValue in
            let value = try File.object(rawValue)
            let primitives = try File.require(value["values"] as? [Any], "field values")
            return InventoryProtocol2FieldValue(
                fieldId: try File.require(value["fieldId"] as? String, "field id"),
                values: try primitives.map {
                    .string(try File.require($0 as? String, "short text value"))
                })
        }
        return .createProtocol2Item(
            InventoryNewProtocol2Item(
                id: try File.require(command["entityId"] as? String, "entity id"),
                name: try File.require(item["name"] as? String, "item name"),
                catalogueRevision: try File.require(
                    command["catalogueRevision"] as? Int, "catalogue revision"),
                typeId: try File.require(item["typeId"] as? String, "type id"),
                values: values,
                quantity: try File.require(item["quantity"] as? Int, "quantity"),
                placement: .hand))
    }

    @Test("a child create missing its inherited required field is refused before sending")
    func missingInheritedRequiredFieldIsRefusedOffline() async throws {
        let (harness, file) = try await Self.downloaded()
        let vector = try file.missingRequiredField()
        #expect(vector["producerRejection"] as? String == "invalid")
        let command = try Self.createCommand(from: vector)

        do {
            _ = try await harness.store.perform(command)
            Issue.record("the offline store accepted a missing inherited required field")
        } catch let error as InventoryCommandError {
            guard case .rejected(let reason, _) = error else {
                Issue.record("the offline store refused with the wrong error: \(error)")
                return
            }
            #expect(reason == .invalid)
        } catch {
            Issue.record("the offline store refused with the wrong error: \(error)")
        }

        #expect(await harness.server.mutations.isEmpty)
        #expect(try harness.replica.read(.item(id: command.entityId)) == nil)
    }

    @Test("a child create with its inherited required field is accepted and drains unchanged")
    func inheritedRequiredFieldDrainsUnchanged() async throws {
        let (harness, file) = try await Self.downloaded()
        let vector = try file.vector(named: "child type with inherited required field")
        let replay = try ValueVectorReplay(file: file, replica: harness.replica)
        let name = try File.require(vector["name"] as? String, "vector name")
        guard let index = replay.expected.firstIndex(where: { $0.name == name }) else {
            throw File.Missing(description: name)
        }

        _ = try await harness.store.perform(replay.commands[index])
        #expect(
            try harness.replica.read(.item(id: replay.commands[index].entityId)) != nil)

        await harness.server.onMutations { LocalFirstHarness.applied($0) }
        harness.reachability.set(true)
        await harness.store.synchronize()

        let sent = await harness.server.mutations
        #expect(sent.count == 1)
        #expect(sent[0].op == replay.expected[index].op)
        #expect(sent[0].catalogueRevision == replay.expected[index].catalogueRevision)
        #expect(sent[0].args == replay.expected[index].args)
        #expect(try harness.ledger.waiting.isEmpty)
        #expect(try harness.ledger.repairs.isEmpty)
    }
}
