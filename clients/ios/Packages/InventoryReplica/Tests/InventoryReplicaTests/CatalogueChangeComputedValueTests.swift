import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// ADR-002 D5: a server evaluation made against an older catalogue than the
/// phone's active one no longer counts as current.
@Suite("Replica: computed values after a catalogue publication")
internal struct CatalogueChangeComputedValueTests {
    private typealias Setup = LocalComputedFixture

    /// A newer catalogue arriving with a feed page that re-sends nothing.
    static func publish(_ catalogue: InventoryCatalogueSnapshot, to replica: InventoryReplica)
        throws
    {
        try replica.apply(
            InventoryChangesPage(
                epoch: Fixture.epoch, items: [], locations: [], events: [], nextSince: 20,
                hasMore: false, catalogueVersion: "cat-2",
                catalogueRevision: catalogue.revision.revision),
            catalogue: catalogue)
    }

    @Test("a newer catalogue re-evaluates a server value made against the old one")
    func newerCatalogueReevaluates() throws {
        let replica = try LocalComputedValueTests.replica()
        let sum = InventoryJSON.object([
            "op": .string("add"), "left": Setup.read(Setup.width), "right": Setup.read(Setup.depth),
        ])

        try Self.publish(
            Setup.catalogue(replacing: Setup.volume, with: sum, revision: Setup.revision + 1),
            to: replica)

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume) == .value(try Setup.decimal("5.0")))
        #expect(
            try Setup.display(replica, Setup.box, Setup.shelfDepth)
                == .value(try Setup.decimal("40")))
    }

    @Test("a newer catalogue this build cannot evaluate leaves the old server value Out of date")
    func newerCatalogueUnevaluableIsOutOfDate() throws {
        let replica = try LocalComputedValueTests.replica()
        let future = InventoryJSON.object([
            "op": .string("modulo"), "left": Setup.read(Setup.width),
            "right": Setup.read(Setup.depth),
        ])

        try Self.publish(
            Setup.catalogue(replacing: Setup.volume, with: future, revision: Setup.revision + 1),
            to: replica)

        #expect(try Setup.display(replica, Setup.box, Setup.volume) == .outOfDate)
    }

    @Test("a server value re-sent against the newer catalogue stands again")
    func resentValueStands() throws {
        let replica = try LocalComputedValueTests.replica()
        let sum = InventoryJSON.object([
            "op": .string("add"), "left": Setup.read(Setup.width), "right": Setup.read(Setup.depth),
        ])
        let next = Setup.revision + 1
        try Self.publish(
            Setup.catalogue(replacing: Setup.volume, with: sum, revision: next), to: replica)
        let seeded = try #require(try Setup.seededRows().first)
        let resent = InventoryItem(
            id: seeded.id, revision: seeded.revision, seq: 30, catalogueRevision: next,
            name: seeded.name, typeId: seeded.typeId, typeKey: seeded.typeKey,
            fieldValues: seeded.fieldValues,
            computedValues: [
                InventoryComputedValue(
                    fieldId: Setup.volume, catalogueRevision: next,
                    evaluation: .ok(try Setup.decimal("5.00")),
                    dependencies: [
                        InventoryValueDependency(
                            itemId: Setup.box, fieldId: Setup.width, revision: 1),
                        InventoryValueDependency(
                            itemId: Setup.box, fieldId: Setup.depth, revision: 1),
                    ], traversedItemIds: [Setup.box], evaluatedItemRevision: 1)
            ],
            placement: .hand, createdAt: Setup.time, updatedAt: Setup.time)

        try replica.apply(
            InventoryChangesPage(
                epoch: Fixture.epoch, items: [resent], locations: [], events: [],
                nextSince: 30, hasMore: false, catalogueVersion: "cat-2",
                catalogueRevision: next))

        #expect(
            try Setup.display(replica, Setup.box, Setup.volume)
                == .value(try Setup.decimal("5.00")))
    }

    @Test("a catalogue that archives a computed field stops evaluating it")
    func archivedComputedFieldIsNotEvaluated() throws {
        let replica = try LocalComputedValueTests.replica()
        let next = Setup.revision + 1
        let archived = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: next, minimumProtocol: 2),
            types: Setup.catalogue.types.map { type in
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                    fields: type.fields.map { field in
                        guard field.id == Setup.volume else { return field }
                        return InventoryCatalogueField(
                            id: field.id, typeId: field.typeId, key: field.key,
                            label: field.label, sortOrder: field.sortOrder, kind: field.kind,
                            cardinality: field.cardinality, required: field.required,
                            storage: field.storage, expressionVersion: field.expressionVersion,
                            expression: field.expression, allowOverride: field.allowOverride,
                            archivedAt: "2026-09-24T00:00:00.000Z")
                    })
            })
        try Self.publish(archived, to: replica)
        let seeded = try #require(try Setup.seededRows().first)
        let resent = InventoryItem(
            id: seeded.id, revision: seeded.revision, seq: 30, catalogueRevision: next,
            name: seeded.name, typeId: seeded.typeId, typeKey: seeded.typeKey,
            fieldValues: seeded.fieldValues,
            computedValues: seeded.computedValues.filter { $0.fieldId != Setup.volume },
            placement: .hand, createdAt: Setup.time, updatedAt: Setup.time)

        try replica.apply(
            InventoryChangesPage(
                epoch: Fixture.epoch, items: [resent], locations: [], events: [],
                nextSince: 30, hasMore: false, catalogueVersion: "cat-2",
                catalogueRevision: next))

        #expect(try Setup.display(replica, Setup.box, Setup.volume) == nil)
    }
}
