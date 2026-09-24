import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Local reducer: computed-field overrides")
internal struct ComputedOverrideReducerTests {
    static let lamp = "20000000-0000-4000-8000-000000000002"
    static let fieldId = CommandVectorDecoding.computedFieldId
    static let time = CommandVectorDecoding.clock

    static func replica(allowOverride: Bool = true) throws -> InventoryReplica {
        let replica = try InventoryReplica(now: { time })
        try replica.store(CommandVectorDecoding.catalogue)
        try replica.apply(
            InventorySnapshotPage(
                epoch: "overrides", highWaterSeq: 0, catalogueVersion: "vectors", total: 1,
                items: [
                    InventoryItem(
                        id: lamp, revision: 1, seq: 0, name: "Lamp", typeKey: "bulb",
                        placement: .hand, createdAt: time, updatedAt: time)
                ], locations: [], nextCursor: nil))
        try replica.store(catalogue(allowOverride: allowOverride))
        return replica
    }

    private static func catalogue(allowOverride: Bool) -> InventoryCatalogueSnapshot {
        let source = CommandVectorDecoding.computedCatalogue
        let type = source.types[0]
        let field = type.fields[0]
        return InventoryCatalogueSnapshot(
            revision: source.revision,
            types: [
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                    fields: [
                        InventoryCatalogueField(
                            id: field.id, typeId: field.typeId, key: field.key, label: field.label,
                            sortOrder: field.sortOrder, kind: field.kind,
                            cardinality: field.cardinality, required: field.required,
                            storage: field.storage, expressionVersion: field.expressionVersion,
                            expression: field.expression, allowOverride: allowOverride)
                    ])
            ])
    }

    static func rejection(_ body: () throws -> Void) -> InventoryRejectedReason? {
        do {
            try body()
            return nil
        } catch InventoryCommandError.rejected(let reason, _) {
            return reason
        } catch {
            return nil
        }
    }

    @Test("an override on a field that forbids one is refused and writes nothing")
    func forbiddenOverride() throws {
        let replica = try Self.replica(allowOverride: false)

        let reason = Self.rejection {
            _ = try replica.performLocally(
                .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .boolean(true)),
                mutationId: "m1", clientTime: Self.time)
        }

        #expect(reason == .invalid)
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: Self.lamp))?.revision == 1)
    }

    @Test("an override of the wrong primitive kind is refused")
    func wrongKind() throws {
        let replica = try Self.replica()

        let reason = Self.rejection {
            _ = try replica.performLocally(
                .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .string("yes")),
                mutationId: "m1", clientTime: Self.time)
        }

        #expect(reason == .invalid)
    }

    @Test("an undeclared field is refused")
    func undeclaredField() throws {
        let replica = try Self.replica()

        let reason = Self.rejection {
            _ = try replica.performLocally(
                .setComputedOverride(
                    id: Self.lamp, fieldId: "40000000-0000-4000-8000-0000000000ff",
                    value: .boolean(true)),
                mutationId: "m1", clientTime: Self.time)
        }

        #expect(reason == .invalid)
    }

    @Test("clearing when no override exists changes nothing, as the server's empty change does")
    func clearWithoutOverride() throws {
        let replica = try Self.replica()

        let application = try replica.performLocally(
            .clearComputedOverride(id: Self.lamp, fieldId: Self.fieldId), mutationId: "m1",
            clientTime: Self.time)

        #expect(application.written == Written(revision: 1, eventIndex: nil))
        #expect(application.events.isEmpty)
    }

    @Test("a second override replaces the first rather than adding a value")
    func overrideReplaces() throws {
        let replica = try Self.replica()
        _ = try replica.performLocally(
            .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Self.time)

        _ = try replica.performLocally(
            .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .boolean(false)),
            mutationId: "m2", clientTime: Self.time)

        let item = try #require(try replica.read(.item(id: Self.lamp)))
        #expect(item.revision == 3)
        #expect(item.fieldValues.map(\.state) == [.value([.boolean(false)])])
        #expect(item.fieldValues.map(\.source) == [.override])
    }

    @Test("undoing an unsent override cancels it and the field has no local value again")
    func undoUnsentOverride() throws {
        let replica = try Self.replica()
        let receipt = try replica.perform(
            .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Self.time)

        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)

        #expect(try replica.read(.item(id: Self.lamp))?.fieldValues.isEmpty == true)
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("undoing a sent override restores the field as it was and reverts the event")
    func undoSentOverride() throws {
        let replica = try Self.replica()
        let receipt = try replica.perform(
            .setComputedOverride(id: Self.lamp, fieldId: Self.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Self.time)
        try replica.markSending(["m1"], at: Self.time)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 2, seq: 42, converged: false)],
                highWaterSeq: 42))

        try replica.undo(receipt, undoMutationId: "u1", clientTime: Self.time)

        #expect(try replica.read(.item(id: Self.lamp))?.fieldValues.isEmpty == true)
        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.command == .revertEvent(seq: 42, entityKind: .item, entityId: Self.lamp))
    }

    @Test("an override survives a restart of the log: it replays from its stored form")
    func storedFormRoundTrips() throws {
        let command = InventoryCommand.setComputedOverride(
            id: Self.lamp, fieldId: Self.fieldId,
            value: .measurement(amount: try InventoryDecimal("2.50"), unit: "l"))

        let stored = StoredCommand(.command(command))
        let decoded = try StoredJSON.decode(StoredCommand.self, from: try StoredJSON.encode(stored))

        #expect(try decoded.logged() == .command(command))
    }
}
