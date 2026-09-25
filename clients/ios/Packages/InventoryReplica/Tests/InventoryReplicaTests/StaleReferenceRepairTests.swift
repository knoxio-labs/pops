import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// POPS-4494: an item change whose reference value the server refused
/// (`target_missing`, `reference_type_mismatch`) opens the catalogue repair,
/// which Edit item settles with a reworked change; every other refusal of
/// that kind still only lets the change go.
@Suite("Stale reference repair")
internal struct StaleReferenceRepairTests {
    private typealias Setup = LocalComputedFixture

    private static func shelf(_ itemId: String?) -> InventoryCommand {
        .editProtocol2Item(
            id: Setup.box, catalogueRevision: Setup.revision,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: Setup.shelf,
                    values: itemId.map {
                        [.reference(InventoryReferenceValue(targetKind: .item, targetId: $0))]
                    })
            ])
    }

    private static func refused(
        _ command: InventoryCommand, reason: InventoryRejectedReason
    ) throws -> InventoryReplica {
        let replica = try LocalComputedValueTests.replica()
        _ = try replica.perform(command, mutationId: "m1", clientTime: Setup.time)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .rejected(reason: reason, message: "x")], highWaterSeq: 12))
        return replica
    }

    @Test(
        "a refused reference value opens the catalogue repair, naming why",
        arguments: [
            (InventoryRejectedReason.targetMissing, InventoryStaleReference.targetMissing),
            (.referenceTypeMismatch, .typeNotAllowed),
        ])
    func refusedReferenceOpensCatalogueRepair(
        reason: InventoryRejectedReason, stale: InventoryStaleReference
    ) throws {
        let replica = try Self.refused(Self.shelf(Setup.elsewhere), reason: reason)

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.kind == .catalogueChanged)
        #expect(repair.catalogue?.staleReference == stale)
        #expect(repair.catalogue?.queued == Self.shelf(Setup.elsewhere))
        #expect(repair.catalogue?.changes.isEmpty == true)
    }

    @Test(
        "target_missing on an edit writing no reference value stays a Let go repair",
        arguments: [true, false])
    func otherTargetMissingIsUnrecognised(clearsReference: Bool) throws {
        let width = InventoryCommand.editProtocol2Item(
            id: Setup.box, catalogueRevision: Setup.revision,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: Setup.width, values: [try Setup.decimal("4.0")])
            ])
        let command = clearsReference ? Self.shelf(nil) : width
        let replica = try Self.refused(command, reason: .targetMissing)

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.kind == .unrecognised("target_missing"))
        #expect(repair.catalogue == nil)
        #expect(throws: InventoryCommandError.self) {
            try replica.resolve("m1", with: .replaceMine(Self.shelf(Setup.rack)), minting: ["m2"])
        }
    }

    @Test("Edit item's change pointing at a live record is sent in the refused one's place")
    func editItemSendsTheReworkedChange() throws {
        let replica = try Self.refused(Self.shelf(Setup.elsewhere), reason: .targetMissing)

        try replica.resolve("m1", with: .replaceMine(Self.shelf(Setup.rack)), minting: ["m2"])

        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.ledger.resolved.first?.outcome == "Sent with current fields")
        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["m2"])
        #expect(sent.first?.command == Self.shelf(Setup.rack))
    }

    @Test(
        "Retry refuses locally rather than resend a reference this phone still cannot show is live"
    )
    func retryRefusesStaleReferenceLocally() throws {
        let replica = try Self.refused(Self.shelf(Setup.elsewhere), reason: .targetMissing)

        #expect(throws: InventoryCommandError.self) {
            try replica.resolve("m1", with: .keepMine(), minting: ["m2"])
        }
        #expect(try replica.ledger.repairs.count == 1)
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("Retry sends the change once this phone can show the reference target is live")
    func retrySendsOnceTargetProvenLive() throws {
        let replica = try Self.refused(Self.shelf(Setup.elsewhere), reason: .targetMissing)
        try replica.apply(
            Setup.changes([
                Setup.item(
                    Setup.elsewhere, values: [Setup.stored(Setup.depth, try Setup.decimal("10"))])
            ]))

        try replica.resolve("m1", with: .keepMine(), minting: ["m2"])

        #expect(try replica.ledger.repairs.isEmpty)
        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["m2"])
        #expect(sent.first?.command == Self.shelf(Setup.elsewhere))
    }

    @Test("an incoming reference on another item stays Let go, even with an own reference value")
    func incomingReferenceOnAnotherItemIsUnrecognised() throws {
        let retype = InventoryCommand.changeProtocol2ItemType(
            id: Setup.box, catalogueRevision: Setup.revision, typeId: Setup.typeId,
            values: [
                InventoryProtocol2FieldValue(
                    fieldId: Setup.shelf,
                    values: [
                        .reference(InventoryReferenceValue(targetKind: .item, targetId: Setup.rack))
                    ])
            ])
        let replica = try LocalComputedValueTests.replica()
        _ = try replica.perform(retype, mutationId: "m1", clientTime: Setup.time)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: [
                    "m1": .rejected(
                        reason: .referenceTypeMismatch, message: "x",
                        incomingReference: InventoryIncomingReference(
                            itemId: Setup.rack, fieldId: Setup.shelf))
                ], highWaterSeq: 12))

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.kind == .unrecognised("reference_type_mismatch"))
        #expect(repair.catalogue == nil)

        try replica.resolve("m1", with: .keepMine(), minting: ["m2"])

        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.ledger.resolved.first?.outcome == "Let go")
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("letting go drops the change and keeps the server's reference")
    func letGoKeepsTheServerValue() throws {
        let replica = try Self.refused(Self.shelf(Setup.elsewhere), reason: .referenceTypeMismatch)

        try replica.resolve("m1", with: .discardMine, minting: [])

        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.ledger.resolved.first?.outcome == "Let go")
        #expect(try replica.outboundMutations().isEmpty)
        let shelf = try replica.read(.item(id: Setup.box))?.fieldValues
            .first { $0.fieldId == Setup.shelf }?.state
        guard case .value(let values)? = shelf, case .reference(let target)? = values.first else {
            Issue.record("expected the server's shelf, got \(String(describing: shelf))")
            return
        }
        #expect(target.targetId == Setup.rack)
    }
}
