import AppCore
import GRDB
import Testing

@testable import InventoryReplica

/// POPS-4493: a drain pass that stops on anything but the network, a resync
/// or a blocked session says so on the Sync ledger, and the change it could
/// not send stays queued.
@Suite("Drain: a pass stuck on a local failure", .timeLimit(.minutes(1)))
internal struct DrainStallTests {
    private static func replicaWithQueuedChange() throws -> InventoryReplica {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "m1", clientTime: Fixture.created)
        return replica
    }

    /// Makes the log refuse to mark anything in flight, as a store that
    /// cannot write would.
    private static func refuseWrites(_ replica: InventoryReplica) throws {
        try replica.write { db in
            try db.execute(
                sql: """
                    CREATE TRIGGER refuse_sending BEFORE UPDATE OF state ON mutation_log
                    WHEN NEW.state = 'sending' BEGIN SELECT RAISE(ABORT, 'refused'); END
                    """)
        }
    }

    private static func allowWrites(_ replica: InventoryReplica) throws {
        try replica.write { db in try db.execute(sql: "DROP TRIGGER refuse_sending") }
    }

    private static func state(_ replica: InventoryReplica, _ mutationId: String) throws -> String? {
        try replica.database.read { db in
            try String.fetchOne(
                db, sql: "SELECT state FROM mutation_log WHERE mutation_id = ?",
                arguments: [mutationId])
        }
    }

    @Test("a store that refuses a write stalls sending, visibly, and the change stays queued")
    func refusedWriteStalls() async throws {
        let replica = try Self.replicaWithQueuedChange()
        try Self.refuseWrites(replica)
        let harness = DrainHarness(replica: replica, submit: DrainFixture.answering([:]))

        #expect(await harness.drain.drainNow() == .retryLater)

        let ledger = try replica.read(.syncLedger)
        #expect(ledger.sendingStall == InventorySendingStall(since: Fixture.created))
        #expect(try replica.read(.replicaStatus) == .current)
        #expect(try Self.state(replica, "m1") == "queued")
        #expect(harness.submittedIds.isEmpty)
    }

    @Test("a corrupt value met while sending stalls sending rather than showing offline")
    func corruptValueStalls() async throws {
        let replica = try Self.replicaWithQueuedChange()
        let harness = DrainHarness(
            replica: replica,
            submit: DrainFixture.failing(InventoryReplicaError.corruptValue("outcome")))

        #expect(await harness.drain.drainNow() == .retryLater)

        #expect(try replica.read(.syncLedger).sendingStall != nil)
        #expect(try replica.read(.replicaStatus) == .current)
        #expect(try Self.state(replica, "m1") == "queued")
    }

    @Test("an outcome the replica cannot record stalls sending and returns the batch to the queue")
    func unrecordableOutcomeStalls() async throws {
        let replica = try Self.replicaWithQueuedChange()
        let harness = DrainHarness(
            replica: replica,
            submit: { _ in
                InventoryMutationBatchResult(outcomes: [:], highWaterSeq: 30)
            })

        #expect(await harness.drain.drainNow() == .retryLater)

        #expect(try replica.read(.syncLedger).sendingStall != nil)
        #expect(try Self.state(replica, "m1") == "queued")
    }

    @Test("a network failure still shows offline, not a stall")
    func networkFailureIsOffline() async throws {
        let replica = try Self.replicaWithQueuedChange()
        let harness = DrainHarness(
            replica: replica, submit: DrainFixture.failing(RepositoryError.transport("offline")))

        #expect(await harness.drain.drainNow() == .retryLater)

        #expect(try replica.read(.syncLedger).sendingStall == nil)
        guard case .offline = try replica.read(.replicaStatus) else {
            Issue.record("expected offline")
            return
        }
        #expect(try Self.state(replica, "m1") == "queued")
    }

    @Test("a blocked session shows blocked, not a stall")
    func blockedIsNotAStall() async throws {
        let replica = try Self.replicaWithQueuedChange()
        let harness = DrainHarness(
            replica: replica, submit: DrainFixture.failing(RepositoryError.unauthorized))

        #expect(await harness.drain.drainNow() == .blocked)

        #expect(try replica.read(.syncLedger).sendingStall == nil)
        #expect(try replica.read(.replicaStatus) == .blocked(reason: .sessionExpired))
    }

    @Test("the next pass that gets through clears the stall and sends the change")
    func recoveryClearsStall() async throws {
        let replica = try Self.replicaWithQueuedChange()
        try Self.refuseWrites(replica)
        let harness = DrainHarness(replica: replica, submit: DrainFixture.answering([:]))
        #expect(await harness.drain.drainNow() == .retryLater)
        #expect(try replica.read(.syncLedger).sendingStall != nil)

        try Self.allowWrites(replica)

        #expect(await harness.drain.drainNow() == .drained)
        #expect(try replica.read(.syncLedger).sendingStall == nil)
        #expect(harness.submittedIds == ["m1"])
    }
}
