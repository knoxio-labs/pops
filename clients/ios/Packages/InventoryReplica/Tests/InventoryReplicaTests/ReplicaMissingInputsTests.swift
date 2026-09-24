import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Replica: missing inputs of an unavailable computed value")
internal struct ReplicaMissingInputsTests {
    private typealias Setup = LocalComputedFixture

    /// `shelfDepth` becomes `coalesce(width, depth)` and `volume` reads it, so
    /// `volume` only sees `shelfDepth`'s inputs through the replica's snapshot.
    private static func replica() throws -> InventoryReplica {
        let fallback = InventoryJSON.object([
            "op": .string("coalesce"),
            "values": .array([Setup.read(Setup.width), Setup.read(Setup.depth)]),
        ])
        return try LocalComputedValueTests.replica(
            catalogue: Setup.catalogue(replacing: [
                Setup.shelfDepth: fallback, Setup.volume: Setup.read(Setup.shelfDepth),
            ]))
    }

    private static func volume(_ replica: InventoryReplica) throws -> InventoryComputedValue {
        let item = try #require(try replica.read(.item(id: Setup.box)))
        return try #require(item.computedValues.first { $0.fieldId == Setup.volume })
    }

    @Test("a computed input's missing inputs pass through to the field that reads it")
    func passesThroughComputedInput() throws {
        let replica = try Self.replica()

        try LocalComputedValueTests.edit(replica, Setup.box, Setup.width, nil, mutationId: "m1")
        try LocalComputedValueTests.edit(replica, Setup.box, Setup.depth, nil, mutationId: "m2")

        let volume = try Self.volume(replica)
        #expect(
            volume.evaluation
                == .unavailable(reason: "missing_dependency", failedFieldId: Setup.depth))
        #expect(
            volume.missingInputs == [
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: Setup.width, itemId: Setup.box),
                InventoryExpressionMissingInput(
                    reason: "missing_dependency", fieldId: Setup.depth, itemId: Setup.box),
            ])
    }

    @Test("a stored value written before the list existed reads back with none")
    func oldStoredJSONHasNoMissingInputs() throws {
        let replica = try LocalComputedValueTests.replica()
        let unavailable = Setup.item(
            Setup.box, revision: 2, values: [],
            computed: [
                InventoryComputedValue(
                    fieldId: Setup.volume, catalogueRevision: Setup.revision,
                    evaluation: .unavailable(
                        reason: "missing_dependency", failedFieldId: Setup.width),
                    dependencies: [], traversedItemIds: [Setup.box], evaluatedItemRevision: 2,
                    missingInputs: [
                        InventoryExpressionMissingInput(
                            reason: "missing_dependency", fieldId: Setup.width, itemId: Setup.box)
                    ])
            ])
        try replica.apply(Setup.changes([unavailable]))
        #expect(try Self.volume(replica).missingInputs.map(\.fieldId) == [Setup.width])

        try replica.database.write { db in
            try db.execute(
                sql: """
                    UPDATE \(ComputedValueRows.tableName)
                    SET value_json = json_remove(value_json, '$.missingInputs')
                    WHERE item_id = ? AND field_id = ?
                    """,
                arguments: [Setup.box, Setup.volume])
        }

        let volume = try Self.volume(replica)
        #expect(volume.missingInputs.isEmpty)
        #expect(
            volume.evaluation
                == .unavailable(reason: "missing_dependency", failedFieldId: Setup.width))
    }
}
