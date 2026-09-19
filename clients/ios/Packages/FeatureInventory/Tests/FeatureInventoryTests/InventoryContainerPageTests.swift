import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Container page on the item page")
internal struct InventoryContainerPageTests {
    private typealias Fixture = InventoryFixture

    private static func store() -> RecordingInventoryStore {
        RecordingInventoryStore(
            InMemoryInventoryStore(
                items: [
                    Fixture.item("box", "Kitchen box", at: .location("hall"), access: .open),
                    Fixture.item("mug", "Mug", at: .container("box")),
                ],
                locations: [Fixture.location("hall", "Hall")]))
    }

    private static func loaded(
        _ detail: InventoryItemDetailViewModel, _ model: InventoryContainerPageModel
    ) async -> InventoryContainerPagePhase {
        await awaitObservedCondition {
            InventoryContainerPagePhase(detail: detail.phase, container: model.content.phase)
                != .loading
        }
        return InventoryContainerPagePhase(detail: detail.phase, container: model.content.phase)
    }

    @Test("The page shows only once both the item page and the contents have answered")
    func phaseWaitsForBoth() {
        #expect(
            InventoryContainerPagePhase(detail: .loading, container: .loaded(nil)) == .missing)
        #expect(InventoryContainerPagePhase(detail: .loading, container: .loading) == .loading)
        #expect(InventoryContainerPagePhase(detail: .missing, container: .loading) == .missing)
        #expect(
            InventoryContainerPagePhase(detail: .unavailable, container: .loaded(nil))
                == .unavailable)
        #expect(
            InventoryContainerPagePhase(detail: .loading, container: .unavailable) == .unavailable)
    }

    @Test("A container loads onto the item page, with its record and its contents")
    func loadsBoth() async throws {
        let store = Self.store()
        let detail = InventoryItemDetailViewModel(itemId: "box", store: store)
        let model = InventoryContainerPageModel(id: "box", runner: detail.runner)
        let observing = Task {
            async let container: Void = model.observe()
            async let item: Void = detail.observe()
            _ = await (container, item)
        }
        defer { observing.cancel() }

        guard case .loaded(let item, let profile) = await Self.loaded(detail, model) else {
            Issue.record("the page never loaded")
            return
        }
        #expect(item.record.name == "Kitchen box")
        #expect(profile.contents.entries.map(\.id) == ["mug"])
    }

    @Test("A record that is not a container is not found rather than drawn as one")
    func plainItemIsMissing() async throws {
        let store = Self.store()
        let detail = InventoryItemDetailViewModel(itemId: "mug", store: store)
        let model = InventoryContainerPageModel(id: "mug", runner: detail.runner)
        let observing = Task {
            async let container: Void = model.observe()
            async let item: Void = detail.observe()
            _ = await (container, item)
        }
        defer { observing.cancel() }

        #expect(await Self.loaded(detail, model) == .missing)
    }

    @Test("The contents summary is dropped on the container's own page, and nothing else")
    func summaryDropped() async throws {
        let store = Self.store()
        let detail = InventoryItemDetailViewModel(itemId: "box", store: store)
        let (task, loaded) = await detail.startAndAwaitDetail()
        defer { task.cancel() }
        let item = try #require(loaded)

        #expect(item.containerSummary == InventoryContainerSummary(itemCount: 1, containerCount: 0))
        let onPage = item.onContainerPage
        #expect(onPage.containerSummary == nil)
        #expect(onPage.record == item.record)
        #expect(onPage.activity == item.activity)
        #expect(onPage.documents == item.documents)
    }

    @Test("Every container verb survives the trip through the item page's action row")
    func verbsRoundTrip() {
        for verb in InventoryContainerVerb.allCases {
            #expect(InventoryContainerVerb(action: verb.action) == verb)
            #expect(verb.action.title == verb.title)
        }
        let edit = InventoryAction("edit", "Edit", symbol: .edit)
        #expect(InventoryContainerVerb(action: edit) == nil)
    }

    @Test("A verb's Undo lands on the item page's runner, so one capsule reverses it")
    func verbsShareTheItemPagesRunner() async throws {
        let store = Self.store()
        let detail = InventoryItemDetailViewModel(itemId: "box", store: store)
        let model = InventoryContainerPageModel(id: "box", runner: detail.runner)
        let observing = Task {
            async let container: Void = model.observe()
            async let item: Void = detail.observe()
            _ = await (container, item)
        }
        defer { observing.cancel() }
        guard case .loaded(_, let profile) = await Self.loaded(detail, model) else {
            Issue.record("the page never loaded")
            return
        }

        await model.perform(.close, on: profile)

        #expect(store.commands == [.setItemAccess(id: "box", access: .closed)])
        let offer = try #require(detail.runner.undoOffer)
        #expect(offer.message == "Closed Kitchen box")
        await detail.runner.undo(offer)
        #expect(store.undone.count == 1)
        #expect(await detail.awaitDetail { $0.record.access == .open } != nil)
    }
}
