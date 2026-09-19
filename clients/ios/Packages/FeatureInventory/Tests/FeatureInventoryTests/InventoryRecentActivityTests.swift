import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Recent activity page and where Recent work leads")
internal struct InventoryRecentActivityTests {
    private typealias Fixture = InventoryFixture

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("kettle", "Kettle", at: .location("kitchen")),
                Fixture.item("box", "Kitchen 12", at: .location("kitchen"), access: .open),
                Fixture.item("old", "Old lamp", at: .hand, deleted: true),
            ],
            locations: [Fixture.location("kitchen", "Kitchen")],
            events: [
                Fixture.event(1, .created, on: "kettle"),
                Fixture.event(
                    2, .moved, on: "kettle", after: ["placement": .link("kitchen")]),
                Fixture.event(3, .created, on: "kitchen", entityKind: .location),
                Fixture.event(4, .accessChanged, on: "box", after: ["access": .choice("open")]),
                Fixture.event(5, .created, on: "old", undoable: false),
                Fixture.event(6, .created, on: "nowhere"),
            ])
    }

    private static func loaded(_ model: InventoryRecentActivityModel) async
        -> [InventoryRecentActivity]?
    {
        await awaitObservedCondition { !model.isLoading }
        guard case .loaded(let activity) = model.activity.phase else { return nil }
        return activity
    }

    @Test("Every record's events arrive newest first, each naming its record")
    func eventsAcrossRecords() async throws {
        let model = InventoryRecentActivityModel(store: Self.store())
        let task = Task { await model.observe() }
        defer { task.cancel() }

        let activity = try #require(await Self.loaded(model))

        #expect(activity.map(\.id) == [6, 5, 4, 3, 2, 1])
        #expect(
            activity.map(\.entry.record) == [
                "Deleted record", "Old lamp", "Kitchen 12", "Kitchen", "Kettle", "Kettle",
            ])
        #expect(activity.first { $0.id == 2 }?.entry.title == "Moved to Kitchen")
        #expect(activity.first { $0.id == 3 }?.entityKind == .location)
        #expect(model.entries.map(\.seq) == [6, 5, 4, 3, 2, 1])
    }

    @Test("The page reads no more than its limit")
    func honoursTheLimit() async throws {
        let store = Self.store()
        var values = store.observe(InventoryRecentActivityModel.query(limit: 2, now: { .now }))
            .makeAsyncIterator()

        let activity = try #require(await values.next())

        #expect(activity.map(\.id) == [6, 5])
    }

    @Test("Undo reverts the event against the record it is about")
    func undoRevertsTheRightRecord() async throws {
        let store = RecordingInventoryStore(Self.store())
        let model = InventoryRecentActivityModel(store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }
        let activity = try #require(await Self.loaded(model))

        let kitchen = try #require(activity.first { $0.id == 3 }?.entry)
        await model.undo(kitchen)

        #expect(
            store.commands == [.revertEvent(seq: 3, entityKind: .location, entityId: "kitchen")])
    }

    @Test("Undo on an event that can no longer be undone, or is not listed, sends nothing")
    func undoIsInertWhenItCannotApply() async throws {
        let store = RecordingInventoryStore(Self.store())
        let model = InventoryRecentActivityModel(store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }
        let activity = try #require(await Self.loaded(model))
        let stale = try #require(activity.first { $0.id == 5 }?.entry)
        let unlisted = InventoryActivityEntry(
            seq: 99, verb: "Logged", subject: "", detail: "", when: "", kind: .edit,
            symbol: .addNew, month: "", from: nil, to: nil, reason: nil, device: nil,
            isUndoable: true)

        await model.undo(stale)
        await model.undo(unlisted)

        #expect(store.commands.isEmpty)
    }

    @Test("A store that never answers leaves the page unavailable, not shimmering forever")
    func unavailable() async {
        let model = InventoryRecentActivityModel(store: EndedInventoryStore())
        await model.observe()

        #expect(model.activity.phase == .unavailable)
        #expect(!model.isLoading)
    }

    @Test("A Recent work row opens the record it is about, or Recent activity once it is gone")
    func recentWorkRoutes() async throws {
        var values = Self.store().observe(InventoryDashboard.query(recentLimit: 6))
            .makeAsyncIterator()
        let dashboard = try #require(await values.next())

        let routes = Dictionary(
            uniqueKeysWithValues: dashboard.recentWork.map { ($0.id, $0.route) })

        #expect(routes[1] == .item("kettle"))
        #expect(routes[3] == .place("kitchen"))
        #expect(routes[4] == .container("box"))
        #expect(routes[5] == .some(nil))
        #expect(routes[6] == .some(nil))
    }
}
