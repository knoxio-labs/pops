import AppCore
import InventoryReplica
import Testing

@Suite("Bounded Inventory query pages")
internal struct ReplicaPageQueryTests {
    @Test("search filters and matching run before the SQLite page limit")
    func searchFiltersBeforeLimit() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("a", name: "A garden lantern", placement: .hand, quantity: 2),
            Fixture.item(
                "b", name: "B garden lantern", placement: .location("hall"), quantity: 2),
            Fixture.item(
                "c", name: "C garden lantern", placement: .location("hall"), quantity: 2),
        ])
        let filter = InventoryItemPageFilter(
            placement: .location, quantityGreaterThanOne: true)
        let query = InventorySearchPageQuery(
            text: "garden", filter: filter, includeLocations: false,
            page: InventoryPageRequest(limit: 1))

        let first = try replica.read(.searchPage(query))
        let cursor = try #require(first.nextCursor)
        let next = try replica.read(
            .searchPage(
                InventorySearchPageQuery(
                    text: "garden", filter: filter, includeLocations: false,
                    page: InventoryPageRequest(limit: 1, cursor: cursor))))

        #expect(first.rows.map(\.id) == ["b"])
        #expect(next.rows.map(\.id) == ["c"])
        #expect(next.nextCursor == nil)
    }

    @Test("mixed item and place pages preserve one stable rank boundary")
    func mixedSearchPageBoundary() throws {
        let locations = [
            InventoryLocation(
                id: "place-b", revision: 1, seq: 1, name: "Garden beta", parentId: nil,
                sortOrder: 1),
            InventoryLocation(
                id: "place-d", revision: 1, seq: 1, name: "Garden delta", parentId: nil,
                sortOrder: 2),
        ]
        let replica = try Fixture.downloaded(
            items: [
                Fixture.item("item-a", name: "Garden alpha"),
                Fixture.item("item-c", name: "Garden charlie"),
            ], locations: locations)
        let query = InventorySearchPageQuery(text: "garden", page: InventoryPageRequest(limit: 2))

        let first = try replica.read(.searchPage(query))
        let cursor = try #require(first.nextCursor)
        let next = try replica.read(
            .searchPage(
                InventorySearchPageQuery(
                    text: "garden", page: InventoryPageRequest(limit: 2, cursor: cursor))))

        #expect(first.rows.map(\.id) == ["item-a", "item-c"])
        #expect(first.rows.allSatisfy { !$0.isLocation })
        #expect(next.rows.map(\.id) == ["place-b", "place-d"])
        #expect(next.rows.allSatisfy { $0.isLocation })
        #expect(next.nextCursor == nil)
    }

    @Test("history scope and kind predicates run before the SQLite page limit")
    func eventFiltersBeforeLimit() throws {
        let replica = try Fixture.downloaded()
        try replica.apply(
            Fixture.changes(events: [
                Fixture.event(seq: 1, itemId: "item", kind: .lifecycleChanged),
                Fixture.event(seq: 2, itemId: "item", kind: .lifecycleChanged),
                Fixture.event(seq: 3, itemId: "item", kind: .edited),
                Fixture.event(seq: 4, itemId: "item", kind: .moved),
            ]))
        let firstQuery = InventoryEventPageQuery(
            scope: .item("item"), filter: .lifecycleChanges, page: InventoryPageRequest(limit: 1))

        let first = try replica.read(.eventsPage(firstQuery))
        let cursor = try #require(first.nextCursor)
        let next = try replica.read(
            .eventsPage(
                InventoryEventPageQuery(
                    scope: .item("item"), filter: .lifecycleChanges,
                    page: InventoryPageRequest(limit: 1, cursor: cursor))))

        #expect(first.rows.map(\.seq) == [2])
        #expect(next.rows.map(\.seq) == [1])
        #expect(next.nextCursor == nil)
    }
}
