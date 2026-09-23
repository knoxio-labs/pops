import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory search session")
internal struct InventorySearchSessionTests {
    private typealias Fixture = InventoryListFixture

    @Test("Pick up offers one Undo that returns every row")
    internal func pickUpThenUndo() async throws {
        let store = Self.store()
        let session = InventorySearchSession(store: store)
        let records = [Fixture.record("hose"), Fixture.record("rake")]

        await session.writer.pickUp(["hose", "rake"], from: records)
        let offer = try #require(session.writer.undoOffer)

        #expect(offer.message == "Picked up 2")
        #expect(await Self.placements(in: store) == [.hand, .hand])
        await session.writer.undo(offer)
        #expect(
            await Self.placements(in: store) == [.location("garage"), .location("garage")])
        #expect(session.writer.failure == nil)
    }

    @Test("Move issues item.move through the session runner")
    internal func moveIssuesItemMoveThroughTheRunner() async {
        let base = Self.store()
        let recording = RecordingInventoryStore(base)
        let session = InventorySearchSession(store: recording)
        let records = [Fixture.record("hose")]
        let moving = InventoryRecordActions.moveRequest(["hose"], from: records)
        let destination = InventoryDestination(id: "home", name: "Home", kind: .location)
        let plan = InventoryPlacementPlan(
            request: moving, destination: destination, tree: InventoryLocationTree(nodes: []))

        let landed = await session.runner.perform(
            plan.commands, announcing: plan.message, symbol: .move)

        #expect(landed)
        #expect(recording.commands == [.moveItem(id: "hose", to: .location("home"), verb: .move)])
    }

    @Test("successful Move clears selection")
    internal func successfulMoveClearsSelection() async {
        let session = InventorySearchSession(store: Self.store())
        session.selection.toggle("hose")

        let succeeded = await session.runner.perform(
            [.moveItem(id: "hose", to: .location("home"), verb: .move)],
            announcing: "Moved Garden hose",
            symbol: .move)
        session.settleMove(succeeded: succeeded)

        #expect(!session.selection.isSelecting)
    }

    @Test("failed Move keeps selection")
    internal func failedMoveKeepsSelection() async {
        let session = InventorySearchSession(store: EndedInventoryStore())
        session.selection.toggle("hose")

        let succeeded = await session.runner.perform(
            [.moveItem(id: "hose", to: .location("home"), verb: .move)],
            announcing: "Moved Garden hose",
            symbol: .move)
        session.settleMove(succeeded: succeeded)

        #expect(!succeeded)
        #expect(session.selection.contains("hose"))
    }

    @Test("only record results expose a record id")
    internal func recordIDs() {
        let record = InventorySearchResult(.record(Fixture.record("hose")))
        let place = InventorySearchResult(
            .place(InventorySearchPlace(id: "garage", name: "Garage", parents: [])))

        #expect(record.recordID == "hose")
        #expect(place.recordID == nil)
    }

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("hose", "Garden hose", at: .location("garage")),
                Fixture.item("rake", "Rake", at: .location("garage")),
            ],
            locations: [
                Fixture.location("home", "Home"),
                Fixture.location("garage", "Garage", parent: "home"),
            ],
            catalogue: Fixture.catalogue)
    }

    private static func placements(in store: InMemoryInventoryStore) async
        -> [InventoryPlacement?]
    {
        var values = store.observe(
            InventoryQuery { source in
                ["hose", "rake"].map { source.inventoryItem(id: $0)?.placement }
            }
        ).makeAsyncIterator()
        return await values.next() ?? []
    }
}
