import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// The drain's side of a change held for newer fields (POPS-4494): the
/// refresh that would fetch them decides whether the ledger says "Waiting
/// for new fields" or "Needs an app update".
@Suite("Drain: changes held for newer fields")
internal struct CatalogueDrainTests {
    private static func held(refresh: @escaping FakeSyncTransport.ChangesHandler) async throws
        -> (InventoryDrainPass, InventoryReplica)
    {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])
        try RepairFixture.rename(replica, as: "m1")
        let harness = DrainHarness(
            replica: replica, mintMutationId: { "m2" },
            submit: DrainFixture.answering([
                "m1": .rejected(reason: .catalogueUpdateRequired, message: "newer")
            ]))
        harness.transport.update { $0.changes = refresh }

        return (await harness.drain.drainNow(), replica)
    }

    @Test("a refresh this build is too old for blocks, and the held change needs an app update")
    func tooOldNeedsAnAppUpdate() async throws {
        let (pass, replica) = try await Self.held { _, _ in
            throw InventorySyncTransportError.clientTooOld
        }

        #expect(pass == .blocked)
        #expect(try replica.ledger.waiting.map(\.hold) == [.needsAppUpdate])
    }

    @Test("a refresh that fails on the network leaves the change waiting for new fields")
    func unreachableStillWaits() async throws {
        let (pass, replica) = try await Self.held { _, _ in
            throw RepositoryError.transport("offline")
        }

        #expect(pass == .retryLater)
        #expect(try replica.ledger.waiting.map(\.hold) == [.waitingForFields])
    }
}
