import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Computed values in the replica")
internal struct ComputedValuePersistenceTests {
    private static let fieldId = "volume"

    private static func item(
        _ id: String, revision: Int, seq: Int? = nil, evaluation: InventoryComputedEvaluation,
        dependencies: [InventoryValueDependency] = []
    ) -> InventoryItem {
        let plain = Fixture.item(id, revision: revision)
        return InventoryItem(
            id: plain.id, revision: plain.revision, seq: seq ?? plain.seq, name: plain.name,
            typeKey: nil,
            computedValues: [
                InventoryComputedValue(
                    fieldId: fieldId, catalogueRevision: 2, evaluation: evaluation,
                    dependencies: dependencies, traversedItemIds: [id],
                    evaluatedItemRevision: revision)
            ],
            placement: plain.placement, createdAt: plain.createdAt, updatedAt: plain.updatedAt)
    }

    /// A replica holding the revision the evaluations name, which declares
    /// `volume` as computed short text.
    private static func replica() throws -> InventoryReplica {
        let replica = try InventoryReplica()
        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 2, minimumProtocol: 2),
                types: [
                    InventoryCatalogueType(
                        id: LocalComputedFixture.typeId, key: "box", label: "Box", sortOrder: 0,
                        fields: [
                            LocalComputedFixture.field(
                                fieldId, key: "volume", kind: .shortText,
                                expression: LocalComputedFixture.read("width"))
                        ])
                ]))
        return replica
    }

    private static func display(_ replica: InventoryReplica, _ id: String) throws
        -> InventoryComputedDisplay?
    {
        let item = try #require(try replica.read(.item(id: id)))
        return item.computedValues.first?.display(in: item) { other in
            (try? replica.read(.item(id: other)))??.revision
        }
    }

    @Test("a snapshot's evaluations are kept with the revision they were made for")
    func snapshotKeepsEvaluations() throws {
        let replica = try Self.replica()

        try replica.apply(
            Fixture.snapshot(items: [Self.item("box", revision: 3, evaluation: .ok(.string("6 l")))]
            ))

        let stored = try #require(try replica.read(.item(id: "box")))
        #expect(stored.computedValues.map(\.evaluatedItemRevision) == [3])
        #expect(try Self.display(replica, "box") == .value(.string("6 l")))
    }

    @Test("a newer row replaces its evaluations; an older one leaves them")
    func newerRowReplaces() throws {
        let replica = try Self.replica()
        try replica.apply(
            Fixture.snapshot(items: [Self.item("box", revision: 3, evaluation: .ok(.string("6 l")))]
            ))

        try replica.apply(
            Fixture.changes(items: [
                Self.item(
                    "box", revision: 4,
                    evaluation: .unavailable(reason: "missing_dependency", failedFieldId: "width"))
            ]))
        #expect(
            try Self.display(replica, "box")
                == .unavailable(reason: "missing_dependency", failedFieldId: "width"))

        try replica.apply(
            Fixture.changes(items: [Self.item("box", revision: 2, evaluation: .ok(.string("1 l")))])
        )
        #expect(
            try Self.display(replica, "box")
                == .unavailable(reason: "missing_dependency", failedFieldId: "width"))
    }

    @Test("a local edit shows the evaluation as out of date until the server re-evaluates")
    func localEditInvalidates() throws {
        let replica = try Self.replica()
        try replica.apply(
            Fixture.snapshot(items: [Self.item("box", revision: 3, evaluation: .ok(.string("6 l")))]
            ))

        _ = try replica.perform(
            .setItemCode(id: "box", code: "B1"), mutationId: "m1", clientTime: Fixture.created)
        #expect(try Self.display(replica, "box") == .outOfDate)

        try replica.apply(
            Fixture.changes(items: [Self.item("box", revision: 4, evaluation: .ok(.string("7 l")))])
        )
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 4, seq: 21, converged: false)],
                highWaterSeq: 21))
        #expect(try Self.display(replica, "box") == .value(.string("7 l")))
    }

    @Test("a newer revision of an item it depends on shows the evaluation as out of date")
    func dependencyChangeInvalidates() throws {
        let replica = try Self.replica()
        let dependency = InventoryValueDependency(itemId: "shelf", fieldId: "depth", revision: 1)
        try replica.apply(
            Fixture.snapshot(items: [
                Self.item(
                    "box", revision: 3, evaluation: .ok(.string("6 l")), dependencies: [dependency]),
                Fixture.item("shelf", revision: 1),
            ]))
        #expect(try Self.display(replica, "box") == .value(.string("6 l")))

        try replica.apply(Fixture.changes(items: [Fixture.item("shelf", revision: 2)]))

        #expect(try Self.display(replica, "box") == .outOfDate)
    }

    @Test("a dependent re-sent at its revision with a newer seq replaces the stale evaluation")
    func resentDependentReplaces() throws {
        let replica = try Self.replica()
        let before = InventoryValueDependency(itemId: "shelf", fieldId: "depth", revision: 1)
        let after = InventoryValueDependency(itemId: "shelf", fieldId: "depth", revision: 2)
        try replica.apply(
            Fixture.snapshot(items: [
                Self.item(
                    "box", revision: 3, seq: 3, evaluation: .ok(.string("6 l")),
                    dependencies: [before]),
                Fixture.item("shelf", revision: 1),
            ]))

        try replica.apply(
            Fixture.changes(items: [
                Fixture.item("shelf", revision: 2),
                Self.item(
                    "box", revision: 3, seq: 9, evaluation: .ok(.string("7 l")),
                    dependencies: [after]),
            ]))
        #expect(try Self.display(replica, "box") == .value(.string("7 l")))
        #expect(try replica.read(.item(id: "box"))?.seq == 9)

        try replica.apply(
            Fixture.changes(items: [
                Self.item(
                    "box", revision: 3, seq: 9, evaluation: .ok(.string("1 l")),
                    dependencies: [after])
            ]))
        #expect(try Self.display(replica, "box") == .value(.string("7 l")))
    }

    @Test("a new epoch discards evaluations with the rest of the server's state")
    func epochResetDiscards() throws {
        let replica = try Self.replica()
        try replica.apply(
            Fixture.snapshot(items: [Self.item("box", revision: 3, evaluation: .ok(.string("6 l")))]
            ))

        try replica.apply(
            Fixture.snapshot(items: [Fixture.item("box", revision: 1)], epoch: "epoch-2"))

        #expect(try replica.read(.item(id: "box"))?.computedValues.isEmpty == true)
    }
}
