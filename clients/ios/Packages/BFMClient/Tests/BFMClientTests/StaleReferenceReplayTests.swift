import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// POPS-4494: a queued edit whose reference target went stale by the time it
/// replays (the record was deleted, or its type no longer satisfies the
/// field). The server refuses it outright (`target_missing`,
/// `reference_type_mismatch`), naming no definition, and the phone opens the
/// catalogue repair so Edit item can point the reference at a record the
/// field allows; Let go stays. Any other `target_missing` still only lets the
/// change go.
@Suite("Stale references across replay", .timeLimit(.minutes(1)))
internal struct StaleReferenceReplayTests {
    @Test(
        "a queued edit whose reference target went stale opens the repair Edit item settles",
        arguments: [
            ("target_missing", InventoryStaleReference.targetMissing),
            ("reference_type_mismatch", .typeNotAllowed),
        ]
    )
    func staleReferenceTargetOpensEditItemRepair(
        reason: String, stale: InventoryStaleReference
    ) async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp(
            fields: StaleReference.fields, locations: StaleReference.locations)
        await harness.server.onMutations { LocalFirstHarness.rejected($0, reason: reason) }

        let queued = StaleReference.edit(to: StaleReference.hallway)
        _ = try await harness.store.perform(queued)
        await harness.store.synchronize()

        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .catalogueChanged)
        #expect(repair.entityId == Protocol2Wire.lampId)
        #expect(repair.catalogue?.queued == queued)
        #expect(repair.catalogue?.staleReference == stale)
        #expect(repair.catalogue?.changes.isEmpty == true)
        #expect(try harness.ledger.waiting.isEmpty)
        #expect(try StaleReference.socket(of: harness) == nil)

        await harness.server.onMutations { LocalFirstHarness.applied($0) }
        try await harness.store.resolve(
            repair.id, with: .replaceMine(StaleReference.edit(to: StaleReference.study)))
        await harness.store.synchronize()

        let sent = try #require(await harness.server.mutations.last)
        #expect(sent.mutationId != repair.id)
        #expect(sent.op == "item.edit")
        #expect(sent.catalogueRevision == 2)
        #expect(sent.args.contains(StaleReference.study))
        #expect(!sent.args.contains(StaleReference.hallway))
        #expect(try harness.ledger.repairs.isEmpty)
        #expect(try harness.ledger.resolved.first?.outcome == "Sent with current fields")
    }

    @Test(
        "letting go of a stale reference drops the edit and leaves the lamp as the server has it",
        arguments: ["target_missing", "reference_type_mismatch"]
    )
    func staleReferenceLetGo(reason: String) async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp(
            fields: StaleReference.fields, locations: StaleReference.locations)
        await harness.server.onMutations { LocalFirstHarness.rejected($0, reason: reason) }

        _ = try await harness.store.perform(StaleReference.edit(to: StaleReference.hallway))
        await harness.store.synchronize()
        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .catalogueChanged)

        try await harness.store.resolve(repair.id, with: .discardMine)

        #expect(try harness.ledger.repairs.isEmpty)
        #expect(try harness.ledger.resolved.first?.outcome == "Let go")
        #expect(try StaleReference.socket(of: harness) == nil)
        #expect(await harness.server.mutations.map(\.mutationId) == [repair.id])
    }

    @Test(
        "target_missing on a change carrying no reference value still only lets it go",
        arguments: [
            StaleReference.moveToHallway,
            StaleReference.editLumens,
        ]
    )
    func targetMissingWithoutReferenceStaysUnrecognised(command: StaleReference.Command)
        async throws
    {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp(
            fields: StaleReference.fields, locations: StaleReference.locations)
        await harness.server.onMutations {
            LocalFirstHarness.rejected($0, reason: "target_missing")
        }

        _ = try await harness.store.perform(try command.make())
        await harness.store.synchronize()

        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .unrecognised("target_missing"))
        #expect(repair.catalogue == nil)
        await #expect(throws: InventoryCommandError.self) {
            try await harness.store.resolve(
                repair.id, with: .replaceMine(StaleReference.edit(to: StaleReference.study)))
        }
        try await harness.store.resolve(repair.id, with: .keepMine())
        #expect(try harness.ledger.repairs.isEmpty)
        #expect(try harness.ledger.resolved.first?.outcome == "Let go")
    }

    @Test("an incoming reference on another item stays Let go, even with an own reference value")
    func incomingReferenceOnAnotherItemStaysUnrecognised() async throws {
        let harness = try LocalFirstHarness()
        try await harness.downloadLamp(
            fields: StaleReference.fields, locations: StaleReference.locations)
        await harness.server.onMutations {
            LocalFirstHarness.rejected(
                $0, reason: "reference_type_mismatch",
                incomingReference: (
                    itemId: StaleReference.otherItemId, fieldId: StaleReference.otherFieldId
                ))
        }

        let queued = StaleReference.edit(to: StaleReference.hallway)
        _ = try await harness.store.perform(queued)
        await harness.store.synchronize()

        let repair = try #require(try harness.ledger.repairs.first)
        #expect(repair.kind == .unrecognised("reference_type_mismatch"))
        #expect(repair.catalogue == nil)

        try await harness.store.resolve(repair.id, with: .keepMine())
        #expect(try harness.ledger.repairs.isEmpty)
        #expect(try harness.ledger.resolved.first?.outcome == "Let go")
    }
}

/// The lamp with a `Socket` field referencing a place, and the two places it
/// can name: the hallway the server says is stale, and the study.
internal enum StaleReference {
    static let socketField = "8b1e6f0a-2c3d-4e5f-9a7b-0c1d2e3f4a51"
    static let hallway = "8b1e6f0a-2c3d-4e5f-9a7b-0c1d2e3f4a61"
    static let study = "8b1e6f0a-2c3d-4e5f-9a7b-0c1d2e3f4a62"
    /// Some OTHER item and field a `reference_type_mismatch` names as the
    /// one actually broken by a type change, distinct from the lamp and its
    /// own `socketField` (POPS-4617).
    static let otherItemId = "8b1e6f0a-2c3d-4e5f-9a7b-0c1d2e3f4a71"
    static let otherFieldId = "8b1e6f0a-2c3d-4e5f-9a7b-0c1d2e3f4a72"

    static let fields =
        Protocol2Wire.bulbFields + [
            Protocol2Wire.field(
                id: socketField, key: "socket", label: "Socket", kind: "reference",
                sortOrder: 3, referenceKinds: ["location"])
        ]

    static let locations = [
        InventoryWire.location(id: hallway, name: "Hallway"),
        InventoryWire.location(id: study, seq: 2, name: "Study"),
    ]

    static func edit(to locationId: String) -> InventoryCommand {
        .editProtocol2Item(
            id: Protocol2Wire.lampId, catalogueRevision: 2,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: socketField,
                    values: [
                        .reference(
                            InventoryReferenceValue(targetKind: .location, targetId: locationId))
                    ])
            ])
    }

    /// The socket the replica shows for the lamp, or nil when it has none.
    static func socket(of harness: LocalFirstHarness) throws -> InventoryFieldValueState? {
        try harness.replica.read(.item(id: Protocol2Wire.lampId))?.fieldValues
            .first { $0.fieldId == socketField }?.state
    }

    /// A change that carries no reference value, named for the test's label.
    struct Command: Sendable, CustomTestStringConvertible {
        let testDescription: String
        let make: @Sendable () throws -> InventoryCommand
    }

    static let moveToHallway = Command(testDescription: "a move to a place") {
        .moveItem(id: Protocol2Wire.lampId, to: .location(hallway), verb: .move)
    }

    static let editLumens = Command(testDescription: "an edit of a measurement") {
        try LocalFirstHarness.editLumens()
    }
}
