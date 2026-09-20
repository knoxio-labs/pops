import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Open containers page")
internal struct InventoryOpenContainersTests {
    private typealias Fixture = InventoryFixture

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("kitchen", "Kitchen 12", at: .location("hall"), access: .open),
                Fixture.item("garage", "Garage 03", at: .location("hall"), access: .open),
                Fixture.item("shut", "Shut box", at: .location("hall"), access: .closed),
                Fixture.item(
                    "old", "Old crate", at: .location("hall"), access: .open,
                    lifecycle: .retired),
                Fixture.item("gone", "Gone box", at: .hand, access: .open, deleted: true),
                Fixture.item("mug", "Mug", at: .container("kitchen")),
                Fixture.item("plate", "Plate", at: .container("kitchen")),
            ],
            locations: [Fixture.location("hall", "Hall")])
    }

    private static func loaded(_ model: InventoryOpenContainersModel) async
        -> [InventoryContainerProfile]?
    {
        await awaitObservedCondition { model.containers.phase != .loading }
        guard case .loaded(let containers) = model.containers.phase else { return nil }
        return containers
    }

    @Test("Only active, undeleted containers whose access is open are listed, with contents")
    func onlyOpenContainers() async throws {
        let model = InventoryOpenContainersModel(store: Self.store())
        let task = Task { await model.observe() }
        defer { task.cancel() }

        let containers = try #require(await Self.loaded(model))

        #expect(containers.map(\.id) == ["garage", "kitchen"])
        #expect(containers.first { $0.id == "kitchen" }?.contents.itemCount == 2)
    }

    @Test("The page lists as many containers and items as the dashboard's panel counts")
    func countMatchesTheDashboard() async throws {
        let store = Self.store()
        let model = InventoryOpenContainersModel(store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }
        let dashboard = InventoryDashboardViewModel(store: store)
        let (dashboardTask, answer) = await dashboard.startAndAwaitFirstAnswer()
        defer { dashboardTask.cancel() }

        let containers = try #require(await Self.loaded(model))
        let panel = try #require(answer)

        #expect(containers.count == panel.openContainers.count)
        #expect(
            containers.reduce(0) { $0 + $1.contents.itemCount } == panel.openItemCount)
    }

    @Test("With nothing open the page is empty rather than loading")
    func emptyWhenNothingOpen() async throws {
        let store = InMemoryInventoryStore(items: [
            Fixture.item("shut", "Shut box", at: .hand, access: .closed)
        ])
        let model = InventoryOpenContainersModel(store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }

        #expect(await Self.loaded(model) == [])
    }

    @Test("Close closes the container, offers Undo, and it leaves the page")
    func closeOffersUndo() async throws {
        let store = RecordingInventoryStore(Self.store())
        let model = InventoryOpenContainersModel(store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }
        let kitchen = try #require(await Self.loaded(model)?.first { $0.id == "kitchen" })

        await model.close(kitchen)

        #expect(store.commands == [.setItemAccess(id: "kitchen", access: .closed)])
        let offer = try #require(model.runner.undoOffer)
        #expect(offer.message == "Closed Kitchen 12")
        await awaitObservedCondition {
            model.containers.phase.loadedIDs == ["garage"]
        }
        #expect(model.containers.phase.loadedIDs == ["garage"])
    }

    @Test("A store that never answers leaves the page unavailable, not loading forever")
    func unavailable() async {
        let model = InventoryOpenContainersModel(store: EndedInventoryStore())
        await model.observe()

        #expect(model.containers.phase == .unavailable)
    }
}

extension InventoryLoadPhase where Value == [InventoryContainerProfile] {
    fileprivate var loadedIDs: [String]? {
        guard case .loaded(let containers) = self else { return nil }
        return containers.map(\.id)
    }
}
