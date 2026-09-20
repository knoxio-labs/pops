import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory Items browser")
internal struct InventoryItemsBrowserTests {
    private typealias Fixture = InventoryListFixture

    private static func store(status: InventoryReplicaStatus = .current) -> InMemoryInventoryStore {
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("drill", "Drill", code: "B412", addedDaysAgo: 2),
                Fixture.item("cable", "Cable", type: nil, addedDaysAgo: 3),
                Fixture.item("lamp", "Lamp", at: .hand, type: nil, addedDaysAgo: 40),
                Fixture.item("vase", "Vase", lifecycle: .discarded, addedDaysAgo: 1),
                Fixture.item(
                    "box", "Box", type: "storage_box", access: .open, addedDaysAgo: 1),
                Fixture.item("saw", "Saw", at: .container("box"), addedDaysAgo: 9),
            ],
            locations: [Fixture.location("garage", "Garage")],
            catalogue: Fixture.catalogue)
        store.setReplicaStatus(status)
        return store
    }

    private static func loaded(_ model: InventoryItemsBrowserViewModel) async -> Task<Void, Never> {
        let task = Task { await model.observe() }
        _ = await eventually { model.catalogue != nil }
        return task
    }

    private static func model(_ store: InMemoryInventoryStore) -> InventoryItemsBrowserViewModel {
        InventoryItemsBrowserViewModel(store: store, now: { Fixture.now })
    }

    @Test("the list is every item that is not a container, newest first, in two sections")
    func recentSections() async {
        let model = Self.model(Self.store())
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.sections.map(\.title) == ["This week", "Earlier"])
        #expect(
            model.sections.map { $0.records.map(\.id) } == [["drill", "cable"], ["saw", "lamp"]])
    }

    @Test("sorted by name, the list is one section per initial")
    func nameSections() async {
        let model = Self.model(Self.store())
        model.sort = .name
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.sections.map(\.title) == ["C", "D", "L", "S"])
    }

    @Test("the missing-type filter keeps only untyped items, and places them where they are")
    func missingType() async {
        let model = Self.model(Self.store())
        model.filter.missing = .type
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.shown.map(\.id) == ["cable", "lamp"])
        #expect(model.shown.map(\.detailLine) == ["No type · Garage", "No type · In hand"])
    }

    @Test("Include inactive brings a discarded item into the list but never into the counts")
    func includeInactive() async {
        let model = Self.model(Self.store())
        let first = await Self.loaded(model)
        #expect(!model.shown.contains { $0.id == "vase" })
        first.cancel()

        model.filter.includesInactive = true
        let second = Task { await model.observe() }
        defer { second.cancel() }

        #expect(await eventually { model.shown.contains { $0.id == "vase" } })
        #expect(model.tiles.first { $0.title == "Items" }?.count == 4)
    }

    @Test("the tiles count items, in hand, untyped and added this week")
    func tiles() async {
        let model = Self.model(Self.store())
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.tiles.map(\.title) == ["Items", "In hand", "Untyped", "Recent"])
        #expect(model.tiles.map(\.count) == [4, 1, 2, 2])
    }

    @Test("a query narrows to what the replica's search matched, and the path reads inward")
    func query() async {
        let model = Self.model(Self.store())
        model.query = "sa"
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.shown.map(\.id) == ["saw"])
        #expect(model.shown.first?.placementLine == "Garage › Box")
    }

    @Test("offline shows when the replica last refreshed; a current replica shows nothing")
    func offlineLine() async {
        let offline = Self.model(
            Self.store(status: .offline(lastRefreshAt: Fixture.now.addingTimeInterval(-7_200))))
        let task = await Self.loaded(offline)
        defer { task.cancel() }
        let current = Self.model(Self.store())
        let other = await Self.loaded(current)
        defer { other.cancel() }

        #expect(offline.offlineLine?.hasPrefix("Offline · updated ") == true)
        #expect(current.offlineLine == nil)
        #expect(InventoryOfflineState(.stale(lastRefreshAt: nil))?.line() == "Offline")
    }

    @Test("a store that ends without answering shows unavailable, not an endless skeleton")
    func unbound() async {
        let model = InventoryItemsBrowserViewModel(store: EndedInventoryStore())

        await model.observe()

        #expect(model.phase == .unavailable)
    }

    @Test("Move from the Items browser issues item.move through the model's own runner")
    func moveIssuesItemMoveThroughTheRunner() async throws {
        let recording = RecordingInventoryStore(Self.store())
        let model = InventoryItemsBrowserViewModel(store: recording, now: { Fixture.now })
        let task = await Self.loaded(model)
        defer { task.cancel() }

        let moving = InventoryRecordActions.moveRequest(["drill"], from: model.shown)
        #expect(moving.title == "Drill")

        let destination = InventoryDestination(id: "garage", name: "Garage", kind: .location)
        let plan = InventoryPlacementPlan(
            request: moving, destination: destination, tree: InventoryLocationTree(nodes: []))
        let landed = await model.runner.perform(
            plan.commands, announcing: plan.message, symbol: .move)

        #expect(landed)
        #expect(
            recording.commands == [.moveItem(id: "drill", to: .location("garage"), verb: .move)])
    }
}

/// A store whose every stream ends at once without a value, as an unbound
/// one does.
internal struct EndedInventoryStore: InventoryStore {
    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { $0.finish() }
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw RepositoryError.dependencyNotBound
    }

    func undo(_ receipt: InventoryReceipt) async throws {}

    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {}

    func download() async throws { throw RepositoryError.dependencyNotBound }

    func refresh() async {}

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.dependencyNotBound
    }

    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        throw RepositoryError.dependencyNotBound
    }

    func discardPhoto(_ sha256: String) async throws {}

    func status() -> AsyncStream<InventoryReplicaStatus> { AsyncStream { $0.finish() } }
    func settleTypeArrival(typeKey: String) async throws {}
}
