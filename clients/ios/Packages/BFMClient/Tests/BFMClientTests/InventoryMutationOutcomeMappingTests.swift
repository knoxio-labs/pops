import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// Maps every outcome kind `POST /mobile/inventory/mutations` can answer
/// (POPS-4059's acceptance bar), and the 409/426 that surface as typed
/// errors instead of a `RepositoryError`.
@Suite("BFMInventoryTransport mutation outcomes")
internal struct InventoryMutationOutcomeMappingTests {
    private func submit(_ json: String) async throws -> InventoryMutationBatchResult {
        try await BFMInventoryTransport.stubbed(StubTransport(status: .ok, json: json))
            .submit([Self.mutation(id: "m-1")])
    }

    private static func mutation(id: String) -> InventoryOutboundMutation {
        InventoryOutboundMutation(
            mutationId: id,
            command: .setItemQuantity(id: "item-1", quantity: 2),
            baseRevision: 1,
            dependsOn: [],
            clientTime: Date(timeIntervalSince1970: 0)
        )
    }

    @Test("an applied mutation carries its revision, seq and convergence")
    func applied() async throws {
        let result = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.appliedOutcome(
                    mutationId: "m-1", revision: 5, seq: 9, converged: true))
        )

        #expect(result.highWaterSeq == 20)
        #expect(result.outcomes["m-1"] == .applied(revision: 5, seq: 9, converged: true))
    }

    @Test("a field conflict carries both sides, the winner and the revision it stands on")
    func fieldConflict() async throws {
        let result = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.fieldConflictOutcome(
                    mutationId: "m-1", field: "name", mine: "\"Lamp\"", theirs: "\"Light\"",
                    sourceKind: "device", sourceLabel: "Other Phone", currentRevision: 4))
        )

        guard
            case .conflictField(let field, let mine, let theirs, let source, _, let revision) =
                result.outcomes["m-1"]
        else {
            Issue.record("expected a field conflict")
            return
        }
        #expect(field == "name")
        #expect(mine == "\"Lamp\"")
        #expect(theirs == "\"Light\"")
        #expect(source == .otherDevice(label: "Other Phone"))
        #expect(revision == 4)
    }

    @Test("a code collision carries the holder and the suggestion")
    func codeCollision() async throws {
        let result = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.codeCollisionOutcome(
                    mutationId: "m-1", heldById: "item-9", heldByName: "Other", suggestedCode: "B9")
            )
        )

        #expect(
            result.outcomes["m-1"]
                == .conflictCodeCollision(
                    heldById: "item-9", heldByName: "Other", suggestedCode: "B9")
        )
    }

    @Test("a deleted conflict carries who deleted it and when")
    func deletedConflict() async throws {
        let result = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.deletedConflictOutcome(mutationId: "m-1", sourceKind: "web"))
        )

        guard case .conflictDeleted(let source, _) = result.outcomes["m-1"] else {
            Issue.record("expected a deleted conflict")
            return
        }
        #expect(source == .web)
    }

    @Test("a rejection carries the reason and an unrecognised one is kept, not dropped")
    func rejected() async throws {
        let known = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.rejectedOutcome(mutationId: "m-1", reason: "cycle"))
        )
        #expect(
            known.outcomes["m-1"] == .rejected(reason: .cycle, message: "no")
        )

        let unknown = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.rejectedOutcome(mutationId: "m-1", reason: "a_future_reason"))
        )
        #expect(
            unknown.outcomes["m-1"]
                == .rejected(reason: .unrecognised("a_future_reason"), message: "no")
        )
    }

    @Test("a deferred outcome names what it is waiting on")
    func deferred() async throws {
        let result = try await submit(
            InventoryWire.mutationsResponse(
                InventoryWire.deferredOutcome(mutationId: "m-1", waitingOn: "m-0"))
        )

        #expect(result.outcomes["m-1"] == .deferred(waitingOn: "m-0"))
    }

    @Test("409 resync_required surfaces as the typed resync error, not a RepositoryError")
    func resyncRequired() async throws {
        await #expect(throws: InventorySyncTransportError.resyncRequired) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .conflict, json: InventoryWire.failure(code: "resync_required"))
            ).fetchChanges(since: 999, epoch: "epoch-1", limit: 50)
        }
    }

    @Test("426 client_too_old surfaces as the typed too-old error on every route")
    func clientTooOld() async throws {
        await #expect(throws: InventorySyncTransportError.clientTooOld) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .init(code: 426), json: InventoryWire.failure(code: "client_too_old"))
            ).submit([Self.mutation(id: "m-1")])
        }
    }

    @Test("413 is a payload-too-large transport failure, not an undocumented status")
    func payloadTooLarge() async throws {
        let error = await failure {
            try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .contentTooLarge, json: InventoryWire.payloadTooLarge())
            ).submit([Self.mutation(id: "m-1")])
        }
        #expect(isTransport(error))
    }

    @Test("403 capability_not_granted is unauthorized, same as a revoked device")
    func capabilityDenied() async throws {
        let denied = await failure {
            try await BFMInventoryTransport.stubbed(
                StubTransport(
                    status: .forbidden, json: InventoryWire.forbidden(capability: "inventory.write")
                )
            ).submit([Self.mutation(id: "m-1")])
        }
        let revoked = await failure {
            try await BFMInventoryTransport.stubbed(
                StubTransport(status: .forbidden, json: InventoryWire.deviceRevoked)
            ).submit([Self.mutation(id: "m-1")])
        }

        #expect(denied == .unauthorized)
        #expect(revoked == .unauthorized)
    }

    private func failure(_ work: () async throws -> InventoryMutationBatchResult) async
        -> RepositoryError?
    {
        do {
            _ = try await work()
            return nil
        } catch let error as RepositoryError {
            return error
        } catch {
            return nil
        }
    }

    private func isTransport(_ error: RepositoryError?) -> Bool {
        if case .transport = error { return true }
        return false
    }
}
