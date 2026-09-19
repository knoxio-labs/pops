import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("Online store download")
internal struct OnlineStoreDownloadTests {
    private static let pages: [String?: InventorySnapshotPage] = [
        nil: Fixture.snapshot(items: [Fixture.item("a")], total: 3, nextCursor: "c1"),
        "c1": Fixture.snapshot(items: [Fixture.item("b")], total: 3, nextCursor: "c2"),
        "c2": Fixture.snapshot(items: [Fixture.item("c")], total: 3),
    ]

    private static func store(
        _ script: FakeSyncTransport.Script
    ) throws -> OnlineHarness {
        let replica = try InventoryReplica(now: { Fixture.created })
        let transport = FakeSyncTransport(script)
        return OnlineHarness(
            store: OnlineInventoryStore(replica: replica, transport: transport),
            transport: transport, replica: replica)
    }

    private static func script(
        snapshot: @escaping FakeSyncTransport.SnapshotHandler
    ) -> FakeSyncTransport.Script {
        var script = FakeSyncTransport.Script()
        script.snapshot = snapshot
        script.changes = { _, _ in Fixture.changes() }
        script.catalogue = InventoryCatalogue(version: "cat-1", units: [], types: [])
        return script
    }

    @Test("a download pages the snapshot, follows the feed from its high water, and is current")
    func downloadsEverything() async throws {
        let harness = try Self.store(
            Self.script { cursor in try #require(Self.pages[cursor]) })
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica

        try await store.download()

        #expect(try replica.ids(.recents(limit: 10)).sorted() == ["a", "b", "c"])
        #expect(transport.calls.snapshotCursors == [nil, "c1", "c2"])
        #expect(transport.calls.changesSince == [10])
        #expect(try replica.read(.catalogue).version == "cat-1")
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("a download interrupted after page 2 resumes from the stored cursor, not the start")
    func resumesFromStoredCursor() async throws {
        let harness = try Self.store(
            Self.script { cursor in
                if cursor == "c2" { throw RepositoryError.transport("connection lost") }
                return try #require(Self.pages[cursor])
            })
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica

        await #expect(throws: RepositoryError.transport("connection lost")) {
            try await store.download()
        }
        #expect(try replica.ids(.recents(limit: 10)).sorted() == ["a", "b"])
        #expect(try replica.read(.replicaStatus) == .offline(lastRefreshAt: nil))

        transport.update { $0.snapshot = { cursor in try #require(Self.pages[cursor]) } }
        try await store.download()

        #expect(transport.calls.snapshotCursors == [nil, "c1", "c2", "c2"])
        #expect(try replica.ids(.recents(limit: 10)).sorted() == ["a", "b", "c"])
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("a refresh finishes an interrupted download before following the feed")
    func refreshResumesDownload() async throws {
        let harness = try Self.store(
            Self.script { cursor in
                if cursor == "c1" { throw RepositoryError.transport("lost") }
                return try #require(Self.pages[cursor])
            })
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica
        await #expect(throws: RepositoryError.self) { try await store.download() }

        transport.update { $0.snapshot = { cursor in try #require(Self.pages[cursor]) } }
        await store.refresh()

        #expect(transport.calls.snapshotCursors == [nil, "c1", "c1", "c2"])
        #expect(transport.calls.changesSince == [10])
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("progress is reported from nothing before the first page, then per stored row")
    func reportsProgress() async throws {
        let first = Gate()
        let second = Gate()
        let harness = try Self.store(
            Self.script { cursor in
                if cursor == nil { await first.pass() }
                if cursor == "c1" { await second.pass() }
                return try #require(Self.pages[cursor])
            })
        let store = harness.store
        let replica = harness.replica

        let download = Task { try await store.download() }
        await first.waitForArrival()
        #expect(try replica.read(.replicaStatus) == .downloading(progress: 0))
        first.open()
        await second.waitForArrival()
        #expect(try replica.read(.replicaStatus) == .downloading(progress: 1.0 / 3.0))
        second.open()
        try await download.value

        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("the feed is followed page by page until the server says there is no more")
    func followsFeedPages() async throws {
        var script = Self.script { _ in Fixture.snapshot(items: [Fixture.item("a")]) }
        script.changes = { since, epoch in
            InventoryChangesPage(
                epoch: epoch, items: [], locations: [], events: [],
                nextSince: since == 10 ? 15 : 18, hasMore: since == 10, catalogueVersion: "cat-1")
        }
        let harness = try Self.store(script)
        let store = harness.store
        let transport = harness.transport

        try await store.download()

        #expect(transport.calls.changesSince == [10, 15])
    }

    @Test("a feed page that claims more without moving forward is refused, not looped on")
    func stuckFeedIsRefused() async throws {
        var script = Self.script { _ in Fixture.snapshot(items: [Fixture.item("a")]) }
        script.changes = { since, epoch in
            InventoryChangesPage(
                epoch: epoch, items: [], locations: [], events: [], nextSince: since,
                hasMore: true, catalogueVersion: "cat-1")
        }
        let harness = try Self.store(script)
        let store = harness.store
        let transport = harness.transport

        await #expect(throws: RepositoryError.contractMismatch) { try await store.download() }
        #expect(transport.calls.changesSince == [10])
    }

    @Test("a snapshot page that hands back its own cursor is refused, not looped on")
    func stuckSnapshotIsRefused() async throws {
        let harness = try Self.store(
            Self.script { _ in Fixture.snapshot(items: [], nextCursor: "same") })
        let store = harness.store
        let transport = harness.transport

        await #expect(throws: RepositoryError.contractMismatch) { try await store.download() }
        #expect(transport.calls.snapshotCursors == [nil, "same"])
    }

    @Test("a catalogue the replica already holds is not fetched again")
    func catalogueFetchedOnlyWhenAnnounced() async throws {
        let harness = try Self.store(
            Self.script { cursor in try #require(Self.pages[cursor]) })
        let store = harness.store
        let transport = harness.transport

        try await store.download()
        await store.refresh()

        #expect(transport.calls.catalogueRequests == [nil])
    }
}
