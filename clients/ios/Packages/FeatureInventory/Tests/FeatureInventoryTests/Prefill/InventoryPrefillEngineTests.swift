import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory prefill engine")
internal struct InventoryPrefillEngineTests {
    @Test("facts are repeated for every planned chunk")
    func factsAreRepeatedForEveryPlannedChunk() async throws {
        let first = InventoryPrefillTestSupport.field(id: "first", label: "one", sortOrder: 0)
        let second = InventoryPrefillTestSupport.field(id: "second", label: "two", sortOrder: 1)
        let type = InventoryPrefillTestSupport.type(fields: [first, second])
        let generator = RecordingInventoryPrefillGenerator(
            tokenBudget: 8,
            answers: [
                ["first": .text("alpha")],
                ["second": .text("beta")],
            ])
        let engine = InventoryPrefillEngine(generator: generator)

        let result = await engine.fill(
            source: .text(["a", "b"]), type: type,
            draft: InventoryProtocol2Draft(type: type, catalogueRevision: 1))
        let requests = await generator.requests

        #expect(result == ["first": [.string("alpha")], "second": [.string("beta")]])
        #expect(requests.map(\.fieldIDs) == [["first"], ["second"]])
        #expect(requests.map(\.source) == [.text(["a", "b"]), .text(["a", "b"])])
    }

    @Test("facts longer than half the budget are truncated from the end")
    func factsLongerThanHalfTheBudgetAreTruncated() async {
        let field = InventoryPrefillTestSupport.field(id: "field", label: "f")
        let type = InventoryPrefillTestSupport.type(fields: [field])
        let generator = RecordingInventoryPrefillGenerator(
            tokenBudget: 10, answers: [["field": .text("value")]])
        let engine = InventoryPrefillEngine(generator: generator)

        _ = await engine.fill(
            source: .text(["123", "456", "789"]), type: type,
            draft: InventoryProtocol2Draft(type: type, catalogueRevision: 1))

        let requests = await generator.requests
        #expect(requests.map(\.source) == [.text(["123"])])
    }

    @Test("an answer for a field outside the chunk is ignored")
    func answerOutsideTheChunkIsIgnored() async {
        let field = InventoryPrefillTestSupport.field(id: "field", label: "f")
        let type = InventoryPrefillTestSupport.type(fields: [field])
        let generator = RecordingInventoryPrefillGenerator(
            tokenBudget: 10,
            answers: [
                [
                    "field": .text("kept"),
                    "outside": .text("ignored"),
                ]
            ])
        let engine = InventoryPrefillEngine(generator: generator)

        let result = await engine.fill(
            source: .text([]), type: type,
            draft: InventoryProtocol2Draft(type: type, catalogueRevision: 1))

        #expect(result == ["field": [.string("kept")]])
    }

    @Test("a failed chunk does not discard successful chunks")
    func failedChunkDoesNotDiscardSuccessfulChunks() async {
        let first = InventoryPrefillTestSupport.field(id: "first", label: "one", sortOrder: 0)
        let second = InventoryPrefillTestSupport.field(id: "second", label: "two", sortOrder: 1)
        let type = InventoryPrefillTestSupport.type(fields: [first, second])
        let generator = RecordingInventoryPrefillGenerator(
            tokenBudget: 5,
            answers: [[:], ["second": .text("kept")]],
            failures: [0])
        let engine = InventoryPrefillEngine(generator: generator)

        let result = await engine.fill(
            source: .text([]), type: type,
            draft: InventoryProtocol2Draft(type: type, catalogueRevision: 1))

        #expect(result == ["second": [.string("kept")]])
    }

    @Test("no fillable fields make no generator request")
    func noFillableFieldsMakeNoGeneratorRequest() async {
        let field = InventoryPrefillTestSupport.field(id: "computed", storage: .computed)
        let type = InventoryPrefillTestSupport.type(fields: [field])
        let generator = RecordingInventoryPrefillGenerator(tokenBudget: 10)
        let engine = InventoryPrefillEngine(generator: generator)

        let result = await engine.fill(
            source: .text(["facts"]), type: type,
            draft: InventoryProtocol2Draft(type: type, catalogueRevision: 1))

        #expect(result.isEmpty)
        #expect(await generator.requests.isEmpty)
    }
}
