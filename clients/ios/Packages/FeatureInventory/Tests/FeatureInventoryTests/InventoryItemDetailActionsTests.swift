import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// Printing a label is a web job now (POPS-3992); Item detail has nothing to
/// reprint. A coded item is offered no code-related row action at all, and
/// an uncoded one still offers Label, which now opens the edit form focused
/// on the code field rather than a placeholder (`InventoryFormLabellingTests`).
@MainActor
@Suite("Item detail's own actions never offer to print")
internal struct InventoryItemDetailActionsTests {
    private typealias Fixture = InventoryFixture

    private static func record(code: String?) async throws -> InventoryDetailRecord {
        let item = Fixture.item("item-1", "Cable", at: .hand, code: code)
        let store = InMemoryInventoryStore(items: [item])
        let model = InventoryItemDetailViewModel(itemId: "item-1", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        task.cancel()
        return try #require(loaded?.record)
    }

    @Test("a coded item's actions never include print")
    func codedItemHasNoPrintAction() async throws {
        let record = try await Self.record(code: "K7Q2")

        let ids = InventoryAction.available(for: record).map(\.id)

        #expect(!ids.contains("print"))
        #expect(!ids.contains("label"))
    }

    @Test("an uncoded item is still offered Label")
    func uncodedItemStillOffersLabel() async throws {
        let record = try await Self.record(code: nil)

        let ids = InventoryAction.available(for: record).map(\.id)

        #expect(ids.contains("label"))
        #expect(!ids.contains("print"))
    }
}
