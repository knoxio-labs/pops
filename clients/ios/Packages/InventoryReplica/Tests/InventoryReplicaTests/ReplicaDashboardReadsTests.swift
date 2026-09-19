import AppCore
import InventoryReplica
import Testing

@Suite("Dashboard reads")
internal struct ReplicaDashboardReadsTests {
    @Test("a container's contents are what sits directly inside it, active and live")
    func containerContentsAreDirect() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("crate", placement: .location("garage")),
            Fixture.box("tin", placement: .container("crate")),
            Fixture.item("wrench", placement: .container("crate")),
            Fixture.item("screw", placement: .container("tin")),
            InventoryItem(
                id: "sold", revision: 1, seq: 1, name: "sold", typeKey: nil, lifecycle: .discarded,
                placement: .container("crate"), createdAt: Fixture.created,
                updatedAt: Fixture.created),
            Fixture.item("elsewhere", placement: .location("garage")),
        ])
        #expect(try replica.ids(.contents(ofContainer: "crate")) == ["tin", "wrench"])
        #expect(try replica.ids(.contents(ofContainer: "tin")) == ["screw"])

        try replica.apply(
            Fixture.changes(items: [
                InventoryItem(
                    id: "wrench", revision: 2, seq: 2, name: "wrench", typeKey: nil,
                    placement: .container("crate"), createdAt: Fixture.created,
                    updatedAt: Fixture.created, deletedAt: Fixture.created)
            ]))

        #expect(try replica.ids(.contents(ofContainer: "crate")) == ["tin"])
        #expect(try replica.read(.contents(ofContainer: "nothing")).isEmpty)
    }

    @Test("containers are every live container, open or closed, active or not, by name")
    func containersIncludeClosedAndInactive() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("crate", placement: .location("garage")),
            Fixture.box("Bin", placement: .hand, access: .closed),
            Fixture.box("tin", placement: .container("crate")),
            InventoryItem(
                id: "retired", revision: 1, seq: 1, name: "attic trunk", typeKey: nil,
                lifecycle: .retired, placement: .location("attic"),
                containment: InventoryContainment(access: .closed, isFull: true),
                createdAt: Fixture.created, updatedAt: Fixture.created),
            Fixture.box("gone", placement: .hand),
            Fixture.item("wrench", placement: .container("crate")),
        ])
        #expect(try replica.ids(.containers) == ["retired", "Bin", "crate", "gone", "tin"])

        try replica.apply(
            Fixture.changes(items: [
                InventoryItem(
                    id: "gone", revision: 2, seq: 2, name: "gone", typeKey: nil, placement: .hand,
                    containment: InventoryContainment(access: .open, isFull: false),
                    createdAt: Fixture.created, updatedAt: Fixture.created,
                    deletedAt: Fixture.created)
            ]))

        #expect(try replica.ids(.containers) == ["retired", "Bin", "crate", "tin"])
        #expect(try InventoryReplica().read(.containers).isEmpty)
    }

    @Test("recent events are newest first by seq across every entity, and limited")
    func recentEventsNewestFirst() throws {
        let replica = try Fixture.downloaded()
        try replica.apply(
            Fixture.changes(events: [
                Fixture.event(seq: 12, itemId: "b"), Fixture.event(seq: 14, itemId: "a"),
                Fixture.event(seq: 11, itemId: "a"), Fixture.event(seq: 13, itemId: "c"),
            ]))

        #expect(try replica.read(.recentEvents(limit: 3)).map(\.seq) == [14, 13, 12])
        #expect(try replica.read(.recentEvents(limit: 10)).map(\.seq) == [14, 13, 12, 11])
        #expect(try replica.read(.recentEvents(limit: 0)).isEmpty)
    }

    @Test("counts leave out tombstones and inactive items, and count containers within items")
    func countsExcludeInactiveAndTombstones() throws {
        let replica = try Fixture.downloaded(
            items: [
                Fixture.box("open box", placement: .hand),
                Fixture.box("gone box", placement: .hand),
                InventoryItem(
                    id: "retired box", revision: 1, seq: 1, name: "retired box", typeKey: nil,
                    lifecycle: .retired, placement: .hand,
                    containment: InventoryContainment(access: .closed, isFull: false),
                    createdAt: Fixture.created, updatedAt: Fixture.created),
                Fixture.item("lamp"), Fixture.item("chair"),
            ],
            locations: [Fixture.location("hall"), Fixture.location("attic")])
        #expect(try replica.read(.counts) == InventoryCounts(items: 4, containers: 2, locations: 2))

        try replica.apply(
            Fixture.changes(
                items: [
                    InventoryItem(
                        id: "gone box", revision: 2, seq: 2, name: "gone box", typeKey: nil,
                        placement: .hand,
                        containment: InventoryContainment(access: .open, isFull: false),
                        createdAt: Fixture.created, updatedAt: Fixture.created,
                        deletedAt: Fixture.created)
                ],
                locations: [Fixture.location("attic", revision: 2, deletedAt: Fixture.created)]))

        #expect(try replica.read(.counts) == InventoryCounts(items: 3, containers: 1, locations: 1))
    }

    @Test("an empty replica counts nothing")
    func emptyCounts() throws {
        let replica = try InventoryReplica()

        #expect(try replica.read(.counts) == InventoryCounts(items: 0, containers: 0, locations: 0))
    }
}
