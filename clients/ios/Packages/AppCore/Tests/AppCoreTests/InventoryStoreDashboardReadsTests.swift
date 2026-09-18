import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("In-memory inventory store, dashboard reads")
internal struct InventoryStoreDashboardReadsTests {
    private static func item(
        _ id: String, seq: Int, placement: InventoryPlacement,
        lifecycle: InventoryLifecycle = .active, isContainer: Bool = false,
        deletedAt: Date? = nil
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: seq, name: id, typeKey: nil, lifecycle: lifecycle,
            placement: placement,
            containment: isContainer ? InventoryContainment(access: .open, isFull: false) : nil,
            createdAt: .now, updatedAt: .now, deletedAt: deletedAt)
    }

    private static func event(seq: Int, entityId: String) -> InventoryEvent {
        InventoryEvent(
            seq: seq, entityKind: .item, entityId: entityId, kind: .moved, fields: ["placement"],
            before: [:], after: [:], reason: nil, actor: .web, clientTime: nil,
            serverTime: Date(timeIntervalSinceReferenceDate: TimeInterval(seq)),
            compensatesSeq: nil, undoable: true)
    }

    @Test("a container's contents are its direct, active children only")
    func containerContentsAreDirectAndActive() async throws {
        let store = InMemoryInventoryStore(items: [
            Self.item("box", seq: 1, placement: .location("loc"), isContainer: true),
            Self.item("inner-box", seq: 2, placement: .container("box"), isContainer: true),
            Self.item("plate", seq: 3, placement: .container("box")),
            Self.item("cup", seq: 4, placement: .container("inner-box")),
            Self.item("broken", seq: 5, placement: .container("box"), lifecycle: .discarded),
            Self.item("gone", seq: 6, placement: .container("box"), deletedAt: .now),
        ])

        var values = store.observe(.contents(ofContainer: "box")).makeAsyncIterator()
        let contents = try #require(await values.next())

        #expect(contents.map(\.id) == ["inner-box", "plate"])
    }

    @Test("counts leave out inactive and deleted items and tombstoned locations")
    func countsExcludeInactive() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Self.item("box", seq: 1, placement: .location("loc"), isContainer: true),
                Self.item(
                    "old-box", seq: 2, placement: .hand, lifecycle: .retired, isContainer: true),
                Self.item("plate", seq: 3, placement: .container("box")),
                Self.item("lost", seq: 4, placement: .hand, lifecycle: .lost),
                Self.item("gone", seq: 5, placement: .hand, deletedAt: .now),
            ],
            locations: [
                InventoryLocation(
                    id: "loc", revision: 1, seq: 6, name: "Kitchen", parentId: nil, sortOrder: 0),
                InventoryLocation(
                    id: "old", revision: 1, seq: 7, name: "Shed", parentId: nil, sortOrder: 1,
                    deletedAt: .now),
            ])

        var values = store.observe(.counts).makeAsyncIterator()
        let counts = try #require(await values.next())

        #expect(counts == InventoryCounts(items: 2, containers: 1, locations: 1))
    }

    @Test("recent events come newest first and stop at the limit", arguments: [0, 2, 10])
    func recentEventsAreNewestFirst(limit: Int) async throws {
        let store = InMemoryInventoryStore(events: [
            Self.event(seq: 3, entityId: "a"),
            Self.event(seq: 9, entityId: "b"),
            Self.event(seq: 5, entityId: "c"),
        ])

        var values = store.observe(.recentEvents(limit: limit)).makeAsyncIterator()
        let events = try #require(await values.next())

        #expect(events.map(\.seq) == Array([9, 5, 3].prefix(limit)))
    }

    @Test("a composed query sees one state and emits again when it changes")
    func composedQueryIsConsistent() async throws {
        let store = InMemoryInventoryStore(items: [
            Self.item("box", seq: 1, placement: .location("loc"), isContainer: true),
            Self.item("plate", seq: 2, placement: .hand),
        ])
        let query = InventoryQuery { source in
            (source.inventoryInHand().map(\.id), source.inventoryContents(ofContainer: "box").count)
        }

        var values = store.observe(query).makeAsyncIterator()
        let before = try #require(await values.next())
        _ = try await store.perform(.moveItem(id: "plate", to: .container("box"), verb: .store))
        let after = try #require(await values.next())

        #expect(before.0 == ["plate"])
        #expect(before.1 == 0)
        #expect(after.0.isEmpty)
        #expect(after.1 == 1)
    }

    @Test("seeded events push the next sequence past them")
    func seededEventsAdvanceSequence() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("plate", seq: 1, placement: .hand)],
            events: [Self.event(seq: 40, entityId: "plate")])

        _ = try await store.perform(.moveItem(id: "plate", to: .location("loc"), verb: .putBack))

        var values = store.observe(.item(id: "plate")).makeAsyncIterator()
        let plate = try #require(await values.next())
        #expect((plate?.seq ?? 0) > 40)
    }
}
