import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("Applying snapshot and feed pages")
internal struct ReplicaApplyTests {
    @Test("a fresh replica is empty and has nowhere to resume the feed from")
    func freshReplicaIsEmpty() throws {
        let replica = try InventoryReplica()

        #expect(try replica.read(.replicaStatus) == .empty)
        #expect(try replica.syncPosition().since == nil)
        #expect(try replica.read(.inHand).isEmpty)
    }

    @Test("a snapshot interrupted mid-way keeps its cursor and reports progress")
    func partialSnapshotIsDownloading() throws {
        let replica = try InventoryReplica()

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("a")], total: 4, nextCursor: "page-2"))

        #expect(try replica.read(.replicaStatus) == .downloading(progress: 0.25))
        let position = try replica.syncPosition()
        #expect(position.snapshotCursor == "page-2")
        #expect(position.since == nil)
        #expect(throws: InventoryReplicaError.notDownloaded) {
            try replica.apply(Fixture.changes(items: [Fixture.item("b")]))
        }
        #expect(try replica.read(.item(id: "b")) == nil)
    }

    @Test("the last snapshot page completes the download at the high-water seq")
    func lastSnapshotPageCompletes() throws {
        let replica = try InventoryReplica(now: { Fixture.created })

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("a")], total: 2, nextCursor: "page-2"))
        try replica.apply(Fixture.snapshot(items: [Fixture.item("b")], total: 2))

        let position = try replica.syncPosition()
        #expect(position.since == 10)
        #expect(position.snapshotCursor == nil)
        #expect(position.epoch == Fixture.epoch)
        #expect(try replica.read(.replicaStatus) == .current)
        #expect(try replica.ids(.inHand) == ["a", "b"])
    }

    @Test("a feed row older than the stored revision is ignored")
    func olderRevisionIsIgnored() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("a", name: "Current", revision: 3)
        ])

        try replica.apply(Fixture.changes(items: [Fixture.item("a", name: "Stale", revision: 2)]))

        let stored = try #require(try replica.read(.item(id: "a")))
        #expect(stored.name == "Current")
        #expect(stored.revision == 3)
    }

    @Test("a feed row at the stored revision is not reapplied")
    func equalRevisionIsIgnored() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", name: "First", revision: 3)])

        try replica.apply(
            Fixture.changes(items: [Fixture.item("a", name: "Replayed", revision: 3)]))

        #expect(try replica.read(.item(id: "a"))?.name == "First")
    }

    @Test("a feed row newer than the stored revision replaces it")
    func newerRevisionApplies() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", name: "Old", revision: 3)])

        try replica.apply(
            Fixture.changes(items: [Fixture.item("a", name: "New", revision: 4)], nextSince: 42))

        #expect(try replica.read(.item(id: "a"))?.name == "New")
        #expect(try replica.syncPosition().since == 42)
    }

    @Test("a tombstone removes the item from every query")
    func tombstoneRemovesItem() throws {
        let replica = try Fixture.downloaded(
            items: [
                Fixture.box("box", placement: .location("hall")), Fixture.item("a", name: "Lamp"),
            ],
            locations: [Fixture.location("hall")])
        #expect(try replica.ids(.openContainers) == ["box"])

        let deleted = { (item: InventoryItem) in
            InventoryItem(
                id: item.id, revision: 2, seq: 2, name: item.name, typeKey: nil,
                placement: item.placement, containment: item.containment,
                createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: Fixture.created)
        }
        try replica.apply(
            Fixture.changes(items: [
                deleted(Fixture.box("box", placement: .location("hall"))),
                deleted(Fixture.item("a", name: "Lamp")),
            ]))

        #expect(try replica.read(.item(id: "a")) == nil)
        #expect(try replica.read(.inHand).isEmpty)
        #expect(try replica.read(.openContainers).isEmpty)
        #expect(try replica.read(.contents(ofLocation: "hall")).isEmpty)
        #expect(try replica.read(.search("Lamp")).isEmpty)
        #expect(try replica.read(.recents(limit: 10)).isEmpty)
    }

    @Test("a location tombstone leaves the tree")
    func locationTombstoneLeavesTree() throws {
        let replica = try Fixture.downloaded(
            locations: [
                Fixture.location("hall", sortOrder: 1), Fixture.location("attic", sortOrder: 0),
            ])
        #expect(try replica.read(.locationTree).map(\.id) == ["attic", "hall"])

        try replica.apply(
            Fixture.changes(locations: [
                Fixture.location("attic", revision: 2, deletedAt: Fixture.created)
            ]))

        #expect(try replica.read(.locationTree).map(\.id) == ["hall"])
        #expect(try replica.read(.location(id: "attic")) == nil)
    }

    @Test("a feed page from another epoch is refused and writes nothing")
    func foreignEpochFeedIsRefused() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a", revision: 1)])

        #expect(
            throws: InventoryReplicaError.epochMismatch(stored: Fixture.epoch, received: "epoch-2")
        ) {
            try replica.apply(
                Fixture.changes(items: [Fixture.item("b")], epoch: "epoch-2", nextSince: 99))
        }
        #expect(try replica.read(.item(id: "b")) == nil)
        #expect(try replica.syncPosition().since == 10)
    }

    @Test("a snapshot from a new epoch discards what the old epoch left")
    func newEpochSnapshotDiscardsOldRows() throws {
        let replica = try Fixture.downloaded(
            items: [Fixture.item("gone", revision: 9)], locations: [Fixture.location("old")])
        try replica.apply(Fixture.changes(events: [Fixture.event(seq: 11, itemId: "gone")]))

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("kept", revision: 1)], epoch: "epoch-2"))

        #expect(try replica.read(.item(id: "gone")) == nil)
        #expect(try replica.read(.locationTree).isEmpty)
        #expect(try replica.read(.history(itemId: "gone")).isEmpty)
        #expect(try replica.read(.item(id: "kept"))?.revision == 1)
        #expect(try replica.syncPosition().epoch == "epoch-2")
    }

    @Test("a resync's first page replaces every server row in the same epoch, rewound ones too")
    func resyncingSnapshotDiscardsOldRows() throws {
        let replica = try Fixture.downloaded(
            items: [Fixture.item("gone"), Fixture.item("rewound", name: "Old", revision: 9)])

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("rewound", name: "New", revision: 2)]),
            resyncing: true)

        #expect(try replica.read(.item(id: "gone")) == nil)
        #expect(try replica.read(.item(id: "rewound"))?.name == "New")
        #expect(try replica.ids(.search("old")).isEmpty)
        #expect(try replica.syncPosition().since == 10)
    }

    @Test("a snapshot page that is not a resync's keeps rows it does not carry")
    func ordinarySnapshotKeepsOtherRows() throws {
        let replica = try Fixture.downloaded(
            items: [Fixture.item("kept"), Fixture.item("rewound", name: "Old", revision: 9)])

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("rewound", name: "New", revision: 2)]))

        #expect(try replica.read(.item(id: "kept")) != nil)
        #expect(try replica.read(.item(id: "rewound"))?.name == "Old")
    }

    @Test("feed events become history, newest first, and a repeated event is kept once")
    func eventsBecomeHistory() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a")])

        try replica.apply(Fixture.changes(events: [Fixture.event(seq: 11, itemId: "a")]))
        try replica.apply(
            Fixture.changes(events: [
                Fixture.event(seq: 11, itemId: "a"),
                Fixture.event(seq: 12, itemId: "a", kind: .moved),
                Fixture.event(seq: 13, itemId: "other"),
            ]))

        let history = try replica.read(.history(itemId: "a"))
        #expect(history.map(\.seq) == [12, 11])
        #expect(history.last == Fixture.event(seq: 11, itemId: "a"))
        #expect(try replica.read(.history(locationId: "a")).isEmpty)
    }

    @Test("the replica goes stale once its last complete refresh is older than the threshold")
    func staleAfterThreshold() throws {
        let clock = TestClock(Fixture.created)
        let replica = try InventoryReplica(now: { clock.now }, staleAfter: 60)
        try replica.apply(Fixture.snapshot())

        clock.now = Fixture.created.addingTimeInterval(60)
        #expect(try replica.read(.replicaStatus) == .current)

        clock.now = Fixture.created.addingTimeInterval(61)
        #expect(try replica.read(.replicaStatus) == .stale(lastRefreshAt: Fixture.created))

        try replica.apply(Fixture.changes())
        #expect(try replica.read(.replicaStatus) == .current)
    }
}
