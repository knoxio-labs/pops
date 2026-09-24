import AppCore
import Testing

@testable import InventoryReplica

/// POPS-4473: an override on a field that no longer allows one, because a
/// later catalogue revision turned `allowOverride` off while an item still
/// held one, can still be cleared — clearing only ever moves an item toward
/// its computed value. Setting a new override on such a field stays refused.
@Suite("Local reducer: clearing an override the catalogue has since disallowed")
internal struct ComputedOverrideDisallowedFieldTests {
    private typealias Fixture = ComputedOverrideReducerTests

    /// A later, immutable catalogue revision that turns `allowOverride` off
    /// for the field an item already holds an override for.
    private static func laterCatalogueWithOverrideDisabled() -> InventoryCatalogueSnapshot {
        let source = CommandVectorDecoding.computedCatalogue
        let type = source.types[0]
        let field = type.fields[0]
        return InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(
                revision: source.revision.revision + 1, baseRevision: source.revision.revision,
                minimumProtocol: source.revision.minimumProtocol),
            types: [
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                    fields: [
                        InventoryCatalogueField(
                            id: field.id, typeId: field.typeId, key: field.key, label: field.label,
                            sortOrder: field.sortOrder, kind: field.kind,
                            cardinality: field.cardinality, required: field.required,
                            storage: field.storage, expressionVersion: field.expressionVersion,
                            expression: field.expression, allowOverride: false)
                    ])
            ])
    }

    @Test("clearing an override the catalogue no longer allows still succeeds")
    func clearAfterOverrideDisallowed() throws {
        let replica = try Fixture.replica()
        _ = try replica.performLocally(
            .setComputedOverride(id: Fixture.lamp, fieldId: Fixture.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Fixture.time)

        try replica.store(Self.laterCatalogueWithOverrideDisabled())

        let application = try replica.performLocally(
            .clearComputedOverride(id: Fixture.lamp, fieldId: Fixture.fieldId), mutationId: "m2",
            clientTime: Fixture.time)

        #expect(!application.events.isEmpty)
        #expect(try replica.read(.item(id: Fixture.lamp))?.fieldValues.isEmpty == true)
    }

    @Test("setting a new override once the catalogue forbids it stays refused")
    func setStillRefusedAfterDisallowed() throws {
        let replica = try Fixture.replica()
        _ = try replica.performLocally(
            .setComputedOverride(id: Fixture.lamp, fieldId: Fixture.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Fixture.time)
        try replica.store(Self.laterCatalogueWithOverrideDisabled())

        let reason = Fixture.rejection {
            _ = try replica.performLocally(
                .setComputedOverride(
                    id: Fixture.lamp, fieldId: Fixture.fieldId, value: .boolean(false)),
                mutationId: "m2", clientTime: Fixture.time)
        }

        #expect(reason == .invalid)
        let fieldValues = try replica.read(.item(id: Fixture.lamp))?.fieldValues
        #expect(fieldValues?.map(\.state) == [.value([.boolean(true)])])
    }

    @Test("a queued clear against a catalogue that now forbids the override still applies offline")
    func queuedClearAfterDisallowed() throws {
        let replica = try Fixture.replica()
        _ = try replica.perform(
            .setComputedOverride(id: Fixture.lamp, fieldId: Fixture.fieldId, value: .boolean(true)),
            mutationId: "m1", clientTime: Fixture.time)
        try replica.store(Self.laterCatalogueWithOverrideDisabled())

        _ = try replica.perform(
            .clearComputedOverride(id: Fixture.lamp, fieldId: Fixture.fieldId), mutationId: "m2",
            clientTime: Fixture.time)

        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1", "m2"])
        #expect(try replica.read(.item(id: Fixture.lamp))?.fieldValues.isEmpty == true)
    }
}
