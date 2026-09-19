import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Drain: interruptions, backoff and triggers", .timeLimit(.minutes(1)))
internal struct DrainTriggerTests {
    private static let time = MutationLogPerformTests.time

    private static func queued() throws -> InventoryReplica {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: "m1", clientTime: time)
        return replica
    }

    enum Refusal: CaseIterable, Sendable {
        case unauthorized
        case clientTooOld

        var error: any Error {
            switch self {
            case .unauthorized: RepositoryError.unauthorized
            case .clientTooOld: InventorySyncTransportError.clientTooOld
            }
        }

        var reason: InventoryBlockReason {
            switch self {
            case .unauthorized: .sessionExpired
            case .clientTooOld: .appTooOld
            }
        }
    }

    @Test(
        "401 and 426 block the replica, keep the change queued, and schedule no retry",
        arguments: Refusal.allCases)
    func blockingFailures(refusal: Refusal) async throws {
        let replica = try Self.queued()
        let harness = DrainHarness(replica: replica, submit: DrainFixture.failing(refusal.error))

        #expect(await harness.drain.drainNow() == .blocked)
        #expect(try replica.read(.replicaStatus) == .blocked(reason: refusal.reason))
        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
    }

    @Test("409 takes a fresh snapshot, keeps the log, and sends the same change again")
    func resyncKeepsTheLog() async throws {
        let replica = try Self.queued()
        let harness = DrainHarness(
            replica: replica,
            submit: DrainFixture.inTurn([
                DrainFixture.failing(InventorySyncTransportError.resyncRequired),
                DrainFixture.answering([:]),
            ]))
        harness.transport.update { script in
            script.snapshot = { _ in Fixture.snapshot(items: [Fixture.item("lamp", revision: 4)]) }
        }

        #expect(await harness.drain.drainNow() == .drained)

        #expect(harness.transport.calls.snapshotCursors == [nil])
        let calls = harness.transport.calls.submitted
        #expect(calls.map(\.mutationId) == ["m1", "m1"])
        #expect(calls.first == calls.last)
    }

    @Test(
        "an unreachable server shows offline, and the retry backs off from 2 s, doubling, up to 5 min"
    )
    func backoffDoublesAndCaps() async throws {
        let harness = DrainHarness(
            replica: try Self.queued(), submit: DrainFixture.failing(RepositoryError.unavailable))
        var sleeps = harness.clock.requests.makeAsyncIterator()

        harness.drain.start()
        var observed: [Duration] = []
        for _ in 0..<10 {
            observed.append(try #require(await sleeps.next()))
            harness.clock.release()
        }

        #expect(observed == [2, 4, 8, 16, 32, 64, 128, 256, 300, 300].map { .seconds($0) })
        guard case .offline = try harness.replica.read(.replicaStatus) else {
            Issue.record("expected offline")
            return
        }
    }

    @Test("the network path becoming satisfied sends what was queued while it was not")
    func reachabilityRegainedDrains() async throws {
        let (submissions, submitted) = AsyncStream<([String], Bool)>.makeStream()
        let reachability = FakeReachability(satisfied: false)
        let submit: FakeSyncTransport.SubmitHandler = { mutations in
            submitted.yield((mutations.map(\.mutationId), reachability.isSatisfied))
            return SyncFixture.applied(mutations, revision: 5, seq: 30)
        }
        let harness = DrainHarness(
            replica: try Self.queued(), reachability: reachability, submit: submit)
        var arrivals = submissions.makeAsyncIterator()

        #expect(await harness.drain.drainNow() == .waitingForNetwork)
        #expect(harness.transport.calls.submitted.isEmpty)
        harness.drain.start()
        reachability.set(true)

        let arrival = try #require(await arrivals.next())
        #expect(arrival.0 == ["m1"])
        #expect(arrival.1, "nothing is sent while the path is down")
    }

    @Test("a local-first store given a network path sends what it logs")
    func localFirstStoreDrains() async throws {
        let (submissions, submitted) = AsyncStream<[String]>.makeStream()
        var script = FakeSyncTransport.Script()
        script.submit = { mutations in
            submitted.yield(mutations.map(\.mutationId))
            return SyncFixture.applied(mutations, revision: 5, seq: 30)
        }
        script.changes = { _, _ in Fixture.changes() }
        let store = LocalFirstInventoryStore(
            replica: try MutationLogPerformTests.replica(), transport: FakeSyncTransport(script),
            mintMutationId: SyncFixture.mutationIds(), now: { Self.time },
            reachability: FakeReachability(satisfied: true), drainClock: ManualDrainClock())
        var arrivals = submissions.makeAsyncIterator()

        _ = try await store.perform(.setItemQuantity(id: "lamp", quantity: 2))

        #expect(await arrivals.next() == ["mutation-1"])
    }
}
