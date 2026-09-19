import AppCore
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Drain: what is sent, and in what order", .timeLimit(.minutes(1)))
internal struct DrainSendTests {
    private static let time = MutationLogPerformTests.time
    private static let crateId = MutationLogPerformTests.crateId

    private static func perform(
        _ command: InventoryCommand, _ id: String, on replica: InventoryReplica
    ) throws {
        _ = try replica.perform(command, mutationId: id, clientTime: time)
    }

    @Test(
        "the playground's out-of-order queue: a move logged before its crate's create replays the create first"
    )
    func outOfOrderQueueSendsCreateFirst() async throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("espresso"), Fixture.item("screws"),
        ])
        try replica.store(
            InventoryCatalogue(
                version: "cat-1", units: [],
                types: [
                    InventoryType(
                        key: "crate", name: "Crate", capabilities: [.containment], fields: [])
                ]))
        try Self.perform(
            .createItem(
                InventoryNewItem(
                    id: Self.crateId, name: "Crate", typeKey: "crate", placement: .hand)),
            "create-crate", on: replica)
        try Self.perform(
            .moveItem(id: "espresso", to: .container(Self.crateId), verb: .store), "move-espresso",
            on: replica)
        try Self.perform(.setItemQuantity(id: "screws", quantity: 40), "count-screws", on: replica)
        // The playground's fixture has the crate's create logged after the move
        // into it, which a log written in order only reaches through a repair
        // re-logging the create; renumbering the row stands in for that.
        try replica.write { db in
            try db.execute(
                sql: "UPDATE mutation_log SET local_seq = 100 WHERE mutation_id = 'create-crate'")
        }
        let harness = DrainHarness(replica: replica, submit: DrainFixture.answering([:]))

        #expect(await harness.drain.drainNow() == .drained)

        let sent = harness.submittedIds
        #expect(Set(sent) == ["create-crate", "move-espresso", "count-screws"])
        let create = try #require(sent.firstIndex(of: "create-crate"))
        let move = try #require(sent.firstIndex(of: "move-espresso"))
        #expect(create < move)
        #expect(
            harness.transport.calls.submitted.first { $0.mutationId == "move-espresso" }?.dependsOn
                == ["create-crate"])
    }

    @Test(
        "a transport failure mid-pass resends the unsent batch under the same mutation ids, and nothing else"
    )
    func transportFailureResendsSameIds() async throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.perform(.setItemQuantity(id: "lamp", quantity: 2), "m1", on: replica)
        try Self.perform(.setItemQuantity(id: "mug", quantity: 3), "m2", on: replica)
        try Self.perform(.renameLocation(id: "hall", name: "Hallway"), "m3", on: replica)
        let harness = DrainHarness(
            replica: replica, batchSize: 2,
            submit: DrainFixture.inTurn([
                DrainFixture.answering([:]),
                DrainFixture.failing(RepositoryError.transport("offline")),
                DrainFixture.answering([:]),
            ]))

        #expect(await harness.drain.drainNow() == .retryLater)
        #expect(try replica.outboundMutations().map(\.mutationId) == ["m3"])
        #expect(await harness.drain.drainNow() == .drained)

        let calls = harness.transport.calls.submitted
        #expect(calls.map(\.mutationId) == ["m1", "m2", "m3", "m3"])
        #expect(calls[2] == calls[3])
        #expect(!harness.transport.calls.changesSince.isEmpty)
    }

    @Test("a conflict holds what depends on it; the rest is still sent")
    func conflictHoldsDependents() async throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.perform(.setItemCode(id: "lamp", code: "B1"), "code", on: replica)
        try Self.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]), "rename",
            on: replica)
        try Self.perform(.setItemQuantity(id: "mug", quantity: 3), "count", on: replica)
        let harness = DrainHarness(
            replica: replica, batchSize: 1,
            submit: DrainFixture.answering(["code": DrainFixture.conflict]))

        #expect(await harness.drain.drainNow() == .drained)
        #expect(await harness.drain.drainNow() == .drained)

        #expect(harness.submittedIds == ["code", "count"])
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.syncLedger).waiting.map(\.id) == ["rename"])
    }

    @Test(
        "what the server defers is not offered again in the same pass, and is retried after the backoff"
    )
    func deferredWaitsForTheNextPass() async throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.perform(.setItemQuantity(id: "lamp", quantity: 2), "waiting", on: replica)
        try Self.perform(.setItemQuantity(id: "mug", quantity: 3), "other", on: replica)
        let harness = DrainHarness(
            replica: replica, batchSize: 1,
            submit: DrainFixture.inTurn([
                DrainFixture.answering(["waiting": .deferred(waitingOn: "elsewhere")]),
                DrainFixture.answering([:]),
            ]))

        #expect(await harness.drain.drainNow() == .retryLater)
        #expect(harness.submittedIds == ["waiting", "other"])
        #expect(await harness.drain.drainNow() == .drained)
        #expect(harness.submittedIds == ["waiting", "other", "waiting"])
    }

    @Test(
        "an Undo whose change ended conflicted is dropped unsent, and what was logged on top of it stays held"
    )
    func undoOfConflictedChangeIsDropped() async throws {
        let replica = try MutationLogPerformTests.replica()
        let receipt = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: "m1", clientTime: Self.time)
        let gate = Gate()
        let answer = DrainFixture.answering(["m1": DrainFixture.conflict])
        let harness = DrainHarness(replica: replica) { mutations in
            await gate.pass()
            return try await answer(mutations)
        }

        let pass = Task { await harness.drain.drainNow() }
        await gate.waitForArrival()
        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)
        try Self.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]), "after-undo",
            on: replica)
        gate.open()

        #expect(await pass.value == .drained)
        #expect(harness.submittedIds == ["m1"])
        #expect(try replica.logEntry("u1") == nil)
        let held = try #require(try replica.logEntry("after-undo"))
        #expect(held.dependsOn == ["m1"])
        #expect(try replica.read(.item(id: "lamp"))?.quantity.count == 1)
    }

    @Test("a mutation left in flight by a pass the app did not finish is sent again")
    func inFlightFromAnEarlierRunIsResent() async throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.perform(.setItemQuantity(id: "lamp", quantity: 2), "m1", on: replica)
        try replica.markSending(["m1"], at: Self.time)
        let harness = DrainHarness(replica: replica, submit: DrainFixture.answering([:]))

        #expect(await harness.drain.drainNow() == .drained)
        #expect(harness.submittedIds == ["m1"])
    }
}
