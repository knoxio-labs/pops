import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Replica: coalesce evaluated on the phone")
internal struct LocalCoalesceTests {
    private typealias Setup = LocalComputedFixture

    /// `shelfDepth` becomes `coalesce(shelf.depth, 0)`.
    private static func replica() throws -> InventoryReplica {
        let fallback = InventoryJSON.object([
            "op": .string("coalesce"),
            "values": .array([
                Setup.read(Setup.depth, via: [Setup.shelf]),
                .object(["op": .string("literal"), "value": .string("0")]),
            ]),
        ])
        return try LocalComputedValueTests.replica(
            catalogue: Setup.catalogue(replacing: Setup.shelfDepth, with: fallback))
    }

    @Test("a missing referenced item falls back, and the item appearing re-evaluates")
    func fallbackThenInputAppears() throws {
        let replica = try Self.replica()
        let target = InventoryReferenceValue(targetKind: .item, targetId: Setup.elsewhere)
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.shelf, [.reference(target)], mutationId: "m1")
        #expect(
            try Setup.display(replica, Setup.box, Setup.shelfDepth)
                == .value(try Setup.decimal("0")))

        _ = try replica.perform(
            .createProtocol2Item(
                InventoryNewProtocol2Item(
                    id: Setup.elsewhere, name: "Cupboard", catalogueRevision: Setup.revision,
                    typeId: Setup.typeId,
                    values: [
                        InventoryProtocol2FieldValue(
                            fieldId: Setup.depth, values: [try Setup.decimal("60")])
                    ], placement: .hand)),
            mutationId: "m2", clientTime: Setup.time)

        #expect(
            try Setup.display(replica, Setup.box, Setup.shelfDepth)
                == .value(try Setup.decimal("60")))
    }
}
