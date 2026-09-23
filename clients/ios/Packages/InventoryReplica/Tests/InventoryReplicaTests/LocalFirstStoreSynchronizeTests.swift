import AppCore
import AppCoreFakes
import Synchronization
import Testing

@testable import InventoryReplica

private final class EventLog: Sendable {
    private let events = Mutex<[String]>([])

    var all: [String] { events.withLock { $0 } }

    func note(_ event: String) {
        events.withLock { $0.append(event) }
    }
}

/// A usable path that never reports a change, so nothing but the store's own
/// requests starts a drain pass.
private struct QuietReachability: NetworkReachability {
    var isSatisfied: Bool { true }

    func updates() -> AsyncStream<Bool> {
        AsyncStream { $0.yield(false) }
    }
}

@Suite("Local-first store: synchronize", .timeLimit(.minutes(1)))
internal struct LocalFirstStoreSynchronizeTests {
    private static func store(submitGate gate: Gate, events: EventLog) throws
        -> LocalFirstInventoryStore
    {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])
        var script = FakeSyncTransport.Script()
        script.changes = { _, _ in Fixture.changes() }
        script.submit = { mutations in
            await gate.pass()
            events.note("submitted")
            return SyncFixture.applied(mutations, revision: 5, seq: 30)
        }
        return LocalFirstInventoryStore(
            replica: replica, transport: FakeSyncTransport(script),
            mintMutationId: SyncFixture.mutationIds(), now: { Fixture.created },
            reachability: ScriptedNetworkReachability(satisfied: true),
            drainClock: ManualDrainClock())
    }

    @Test("when synchronize returns, a change logged before it has been sent and applied")
    func waitsForTheDrain() async throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])
        var script = FakeSyncTransport.Script()
        script.changes = { _, _ in Fixture.changes() }
        script.submit = { SyncFixture.applied($0, revision: 5, seq: 30) }
        let store = LocalFirstInventoryStore(
            replica: replica, transport: FakeSyncTransport(script),
            mintMutationId: SyncFixture.mutationIds(), now: { Fixture.created },
            reachability: QuietReachability(), drainClock: ManualDrainClock())
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: "m1",
            clientTime: Fixture.created)

        await store.synchronize()

        #expect(try replica.logEntry("m1")?.state == .applied)
    }

    @Test("synchronize waits for a pass that is already sending to end")
    func waitsForAPassInFlight() async throws {
        let gate = Gate()
        let events = EventLog()
        let store = try Self.store(submitGate: gate, events: events)
        _ = try await store.perform(.setItemQuantity(id: "lamp", quantity: 2))

        let synchronizing = Task {
            await store.synchronize()
            events.note("returned")
        }
        await gate.waitForArrival()
        gate.open()
        await synchronizing.value

        #expect(events.all == ["submitted", "returned"])
    }

    @Test("a cancelled synchronize returns without waiting for the pass to end")
    func cancellationReturns() async throws {
        let gate = Gate()
        let events = EventLog()
        let store = try Self.store(submitGate: gate, events: events)
        _ = try await store.perform(.setItemQuantity(id: "lamp", quantity: 2))

        let synchronizing = Task { await store.synchronize() }
        await gate.waitForArrival()
        synchronizing.cancel()
        await synchronizing.value

        #expect(events.all.isEmpty)
        gate.open()
    }
}
