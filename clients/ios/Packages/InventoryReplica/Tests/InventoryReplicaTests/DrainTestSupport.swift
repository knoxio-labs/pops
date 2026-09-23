import AppCore
import AppCoreFakes
import Foundation
import Synchronization

@testable import InventoryReplica

/// A clock whose sleeps end when the test says: each sleep is announced on
/// `requests`, and waits for `release()`.
internal final class ManualDrainClock: InventoryDrainClock {
    let requests: AsyncStream<Duration>
    private let requested: AsyncStream<Duration>.Continuation
    private let sleeper = Mutex<CheckedContinuation<Void, Never>?>(nil)

    init() {
        (requests, requested) = AsyncStream.makeStream()
    }

    func sleep(for duration: Duration) async throws {
        await withCheckedContinuation { continuation in
            sleeper.withLock { $0 = continuation }
            requested.yield(duration)
        }
        try Task.checkCancellation()
    }

    func release() {
        let continuation = sleeper.withLock { sleeper in
            defer { sleeper = nil }
            return sleeper
        }
        continuation?.resume()
    }
}

/// A drain under test, with the replica it drains and the transport it
/// sends through. The feed answers with nothing new, so the catch-up after
/// an applied batch succeeds.
internal struct DrainHarness {
    let drain: InventoryDrain
    let replica: InventoryReplica
    let transport: FakeSyncTransport
    let reachability: ScriptedNetworkReachability
    let clock: ManualDrainClock

    init(
        replica: InventoryReplica, batchSize: Int = 50,
        reachability: ScriptedNetworkReachability = ScriptedNetworkReachability(satisfied: true),
        mintMutationId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
        submit: @escaping FakeSyncTransport.SubmitHandler
    ) {
        var script = FakeSyncTransport.Script()
        script.submit = submit
        script.changes = { _, _ in Fixture.changes() }
        script.snapshot = { _ in Fixture.snapshot() }
        let transport = FakeSyncTransport(script)
        let clock = ManualDrainClock()
        self.drain = InventoryDrain(
            replica: replica, online: OnlineInventoryStore(replica: replica, transport: transport),
            reachability: reachability, clock: clock, batchSize: batchSize,
            now: { Fixture.created }, mintMutationId: mintMutationId)
        self.replica = replica
        self.transport = transport
        self.reachability = reachability
        self.clock = clock
    }

    var submittedIds: [String] { transport.calls.submitted.map(\.mutationId) }
}

internal enum DrainFixture {
    /// Answers each mutation with the outcome `outcomes` names for it, and
    /// `applied` for any it does not name.
    static func answering(
        _ outcomes: [String: InventoryMutationOutcome]
    ) -> FakeSyncTransport.SubmitHandler {
        { mutations in
            InventoryMutationBatchResult(
                outcomes: Dictionary(
                    uniqueKeysWithValues: mutations.map {
                        (
                            $0.mutationId,
                            outcomes[$0.mutationId]
                                ?? .applied(revision: 9, seq: 30, converged: false)
                        )
                    }),
                highWaterSeq: 30)
        }
    }

    /// Answers call `n` (from 0) with `calls[n]`, and every later call with
    /// the last entry.
    static func inTurn(
        _ calls: [FakeSyncTransport.SubmitHandler]
    ) -> FakeSyncTransport.SubmitHandler {
        let count = Mutex(0)
        return { mutations in
            let index = count.withLock { count in
                defer { count += 1 }
                return min(count, calls.count - 1)
            }
            return try await calls[index](mutations)
        }
    }

    static func failing(_ error: any Error) -> FakeSyncTransport.SubmitHandler {
        { _ in throw error }
    }

    static let conflict = InventoryMutationOutcome.conflictCodeCollision(
        heldById: "mug", heldByName: "Mug", suggestedCode: "B2")
}

extension InventoryReplica {
    /// The log row for `mutationId`, read synchronously so an async test
    /// does not pick GRDB's async read.
    func logEntry(_ mutationId: String) throws -> LogEntry? {
        try database.read { try MutationLogRows.entry(mutationId: mutationId, in: $0) }
    }
}
