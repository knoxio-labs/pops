import AppCore
import InventoryReplica
import Synchronization
import Testing

@Suite("Online store refresh and resync")
internal struct OnlineStoreRefreshTests {
    /// A store over a replica that has downloaded `items`, whose transport
    /// then answers the feed with `changes`.
    private static func downloaded(
        _ items: [InventoryItem],
        changes: @escaping FakeSyncTransport.ChangesHandler
    ) async throws -> OnlineHarness {
        let replica = try InventoryReplica(now: { Fixture.created })
        var script = FakeSyncTransport.Script()
        script.snapshot = { _ in Fixture.snapshot(items: items) }
        script.changes = { _, _ in Fixture.changes() }
        let transport = FakeSyncTransport(script)
        let store = OnlineInventoryStore(replica: replica, transport: transport)
        try await store.download()
        transport.update { $0.changes = changes }
        return OnlineHarness(store: store, transport: transport, replica: replica)
    }

    @Test("a refresh applies the feed and shows as refreshing while it runs")
    func refreshAppliesFeed() async throws {
        let gate = Gate()
        let harness = try await Self.downloaded([Fixture.item("a")]) { _, _ in
            await gate.pass()
            return Fixture.changes(items: [Fixture.item("a", name: "Renamed", revision: 2)])
        }
        let store = harness.store
        let replica = harness.replica

        let refresh = Task { await store.refresh() }
        await gate.waitForArrival()
        #expect(try replica.read(.replicaStatus) == .refreshing)
        gate.open()
        await refresh.value

        #expect(try replica.read(.item(id: "a"))?.name == "Renamed")
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("409 takes a fresh snapshot and keeps nothing stale, even in the same epoch")
    func resyncKeepsNothingStale() async throws {
        let harness = try await Self.downloaded([
            Fixture.item("kept", revision: 5), Fixture.item("gone"),
        ]) { _, _ in throw InventorySyncTransportError.resyncRequired }
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica
        transport.update { script in
            script.snapshot = { _ in Fixture.snapshot(items: [Fixture.item("kept", revision: 2)]) }
            let answered = FeedOnce()
            script.changes = { _, _ in
                if answered.first() { throw InventorySyncTransportError.resyncRequired }
                return Fixture.changes()
            }
        }

        await store.refresh()

        #expect(try replica.ids(.recents(limit: 10)) == ["kept"])
        #expect(try replica.read(.item(id: "kept"))?.revision == 2)
        #expect(try replica.read(.item(id: "gone")) == nil)
        #expect(transport.calls.snapshotCursors == [nil, nil])
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("a feed page from another epoch is answered with a fresh snapshot too")
    func foreignEpochResyncs() async throws {
        let harness = try await Self.downloaded([Fixture.item("old")]) { _, _ in
            Fixture.changes(epoch: "epoch-2")
        }
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica
        transport.update { script in
            script.snapshot = { _ in
                Fixture.snapshot(items: [Fixture.item("new")], epoch: "epoch-2")
            }
        }

        await store.refresh()

        #expect(try replica.ids(.recents(limit: 10)) == ["new"])
        #expect(try replica.syncPosition().epoch == "epoch-2")
        #expect(transport.calls.changesSince == [10, 20, 10])
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("a resync that is refused again surfaces instead of looping")
    func repeatedResyncSurfaces() async throws {
        let replica = try InventoryReplica(now: { Fixture.created })
        var script = FakeSyncTransport.Script()
        script.snapshot = { _ in Fixture.snapshot(items: [Fixture.item("a")]) }
        script.changes = { _, _ in throw InventorySyncTransportError.resyncRequired }
        let transport = FakeSyncTransport(script)
        let store = OnlineInventoryStore(replica: replica, transport: transport)

        await #expect(throws: InventorySyncTransportError.resyncRequired) {
            try await store.download()
        }
        #expect(transport.calls.snapshotCursors == [nil, nil])
    }

    @Test("426 blocks the replica as too old, and reaching the server again clears it")
    func tooOldBlocks() async throws {
        let harness = try await Self.downloaded([Fixture.item("a")]) { _, _ in
            throw InventorySyncTransportError.clientTooOld
        }
        let store = harness.store
        let transport = harness.transport
        let replica = harness.replica

        await store.refresh()
        #expect(try replica.read(.replicaStatus) == .blocked(reason: .appTooOld))

        transport.update { $0.changes = { _, _ in Fixture.changes() } }
        await store.refresh()
        #expect(try replica.read(.replicaStatus) == .current)
    }

    @Test("401 blocks the replica as signed out")
    func unauthorisedBlocks() async throws {
        let harness = try await Self.downloaded([Fixture.item("a")]) { _, _ in
            throw RepositoryError.unauthorized
        }
        let store = harness.store
        let replica = harness.replica

        await store.refresh()

        #expect(try replica.read(.replicaStatus) == .blocked(reason: .sessionExpired))
    }

    @Test("an unreachable server shows offline with the last complete refresh")
    func unreachableIsOffline() async throws {
        let harness = try await Self.downloaded([Fixture.item("a")]) { _, _ in
            throw RepositoryError.transport("offline")
        }
        let store = harness.store
        let replica = harness.replica

        await store.refresh()

        #expect(try replica.read(.replicaStatus) == .offline(lastRefreshAt: Fixture.created))
    }

    @Test("a refresh before anything was downloaded asks the server nothing")
    func refreshWhenEmpty() async throws {
        let replica = try InventoryReplica(now: { Fixture.created })
        let transport = FakeSyncTransport()
        let store = OnlineInventoryStore(replica: replica, transport: transport)

        await store.refresh()

        #expect(transport.calls.snapshotCursors.isEmpty)
        #expect(transport.calls.changesSince.isEmpty)
        #expect(try replica.read(.replicaStatus) == .empty)
    }

    @Test("status() streams the layered status, not only the stored one")
    func statusStreamsOverlay() async throws {
        let harness = try await Self.downloaded([Fixture.item("a")]) { _, _ in
            throw RepositoryError.transport("offline")
        }
        let store = harness.store
        await store.refresh()

        var statuses = store.status().makeAsyncIterator()

        #expect(await statuses.next() == .offline(lastRefreshAt: Fixture.created))
    }
}

/// True the first time it is asked, false after.
private final class FeedOnce: Sendable {
    private let asked = Mutex(false)

    func first() -> Bool {
        asked.withLock { asked in
            defer { asked = true }
            return !asked
        }
    }
}
