import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// Search over protocol-2 values (POPS-4404, POPS-4364): a user-defined
/// field's value and a computed field's effective value find their item,
/// and keep doing so as local edits, overrides, dependencies, sync pages and
/// a relaunch change them.
@Suite("Search: protocol-2 values")
internal struct Protocol2SearchTests {
    private typealias Setup = LocalComputedFixture

    static let brand = "30000000-0000-4000-8000-000000000031"
    static let colour = "30000000-0000-4000-8000-000000000032"
    static let crimson = "30000000-0000-4000-8000-000000000041"

    /// ``LocalComputedFixture``'s box type with a short-text `brand` and an
    /// enum `colour`.
    static let catalogue: InventoryCatalogueSnapshot = {
        let extra = [
            Setup.field(brand, key: "brand", kind: .shortText),
            InventoryCatalogueField(
                id: colour, typeId: Setup.typeId, key: "colour", label: "colour", sortOrder: 0,
                kind: .enumeration, cardinality: .one, required: false, storage: .stored,
                enumOptions: [
                    InventoryCatalogueOption(
                        id: crimson, key: "crimson", label: "Crimson", sortOrder: 0)
                ]),
        ]
        return InventoryCatalogueSnapshot(
            revision: Setup.catalogue.revision,
            types: Setup.catalogue.types.map { type in
                InventoryCatalogueType(
                    id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                    fields: type.fields + extra)
            })
    }()

    /// The fixture's rows, with the box made by Makita in crimson.
    static func rows() throws -> [InventoryItem] {
        let seeded = try Setup.seededRows()
        let box = seeded[0]
        let branded = Setup.item(
            box.id,
            values: box.fieldValues + [
                Setup.stored(brand, .string("Makita")),
                Setup.stored(colour, .enumeration(optionId: crimson)),
            ],
            computed: box.computedValues)
        return [branded, seeded[1]]
    }

    static func seed(_ replica: InventoryReplica) throws {
        try replica.store(catalogue)
        try replica.apply(Setup.snapshot(try rows()))
    }

    static func replica() throws -> InventoryReplica {
        let replica = try InventoryReplica(now: { Setup.time })
        try seed(replica)
        return replica
    }

    static func found(_ replica: InventoryReplica, _ text: String) throws -> [String] {
        try replica.ids(.search(text))
    }

    @Test("a user-defined field's value finds its item: text, and an enum by its label")
    func userDefinedValue() throws {
        let replica = try Self.replica()

        #expect(try Self.found(replica, "makita") == [Setup.box])
        #expect(try Self.found(replica, "crimson") == [Setup.box])
        #expect(try Self.found(replica, Self.crimson).isEmpty)
    }

    @Test("a reference value indexes nothing: its target's id finds only the target")
    func referenceNotIndexed() throws {
        let replica = try Self.replica()

        #expect(try Self.found(replica, Setup.rack) == [Setup.rack])
    }

    @Test("a computed field's server value finds its item")
    func serverComputedValue() throws {
        let replica = try Self.replica()

        #expect(try Self.found(replica, "6.00") == [Setup.box])
    }

    @Test("a local edit re-indexes the phone's own evaluation in place of the server's")
    func localEditReindexes() throws {
        let replica = try Self.replica()

        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")

        #expect(try Self.found(replica, "12.0") == [Setup.box])
        #expect(try Self.found(replica, "6.00").isEmpty)
    }

    @Test("an unavailable result indexes nothing")
    func unavailableIndexesNothing() throws {
        let replica = try Self.replica()

        try LocalComputedValueTests.edit(replica, Setup.box, Setup.depth, nil, mutationId: "m1")

        #expect(try Self.found(replica, "6.0").isEmpty)
        #expect(try Self.found(replica, "missing_dependency").isEmpty)
    }

    @Test("an override is found in place of the evaluation, and clearing it restores it")
    func overrideReindexes() throws {
        let replica = try Self.replica()

        _ = try replica.perform(
            .setComputedOverride(
                id: Setup.box, fieldId: Setup.volume, value: try Setup.decimal("77.25")),
            mutationId: "m1", clientTime: Setup.time)
        #expect(try Self.found(replica, "77.25") == [Setup.box])
        #expect(try Self.found(replica, "6.00").isEmpty)

        _ = try replica.perform(
            .clearComputedOverride(id: Setup.box, fieldId: Setup.volume), mutationId: "m2",
            clientTime: Setup.time)
        #expect(try Self.found(replica, "77.25").isEmpty)
        #expect(try Self.found(replica, "6.0") == [Setup.box])
    }

    @Test("editing an item another one reads re-indexes the dependent")
    func dependencyChangeReindexesDependent() throws {
        let replica = try Self.replica()
        #expect(try Self.found(replica, "4321").isEmpty)

        try LocalComputedValueTests.edit(
            replica, Setup.rack, Setup.depth, [try Setup.decimal("4321")], mutationId: "m1")

        #expect(try Self.found(replica, "4321") == [Setup.rack, Setup.box].sorted())
    }

    @Test("a feed page's newer evaluation is what the item is found by")
    func syncPageReindexes() throws {
        let replica = try Self.replica()
        let box = try Self.rows()[0]
        let fromServer = Setup.item(
            Setup.box, revision: 2, values: box.fieldValues,
            computed: [
                Setup.ok(
                    Setup.volume, try Setup.decimal("8.75"), itemRevision: 2,
                    dependencies: [
                        InventoryValueDependency(
                            itemId: Setup.box, fieldId: Setup.width, revision: 2)
                    ],
                    traversed: [Setup.box])
            ])

        try replica.apply(Setup.changes([fromServer]))

        #expect(try Self.found(replica, "8.75") == [Setup.box])
        #expect(try Self.found(replica, "6.00").isEmpty)
    }

    @Test("what a local edit indexed is still found after a relaunch")
    func survivesRelaunch() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "Protocol2SearchTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let open = {
            try InventoryReplica(onDiskAt: directory, now: { Setup.time }, freeBytes: { _ in .max })
        }
        do {
            let replica = try open()
            try Self.seed(replica)
            try LocalComputedValueTests.edit(
                replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        }

        let reopened = try open()

        #expect(try Self.found(reopened, "12.0") == [Setup.box])
        #expect(try Self.found(reopened, "makita") == [Setup.box])
    }
}
