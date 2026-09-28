import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Inherited catalogue replacement")
internal struct InheritedCatalogueReplacementTests {
    private static let ancestor = "77777777-7777-4777-8777-777777777777"
    private static let child = "66666666-6666-4666-8666-666666666666"
    private static let replacement = "99999999-9999-4999-8999-999999999999"
    private static let archivedAt = "2026-09-02T00:00:00.000Z"

    private static func field(
        _ id: String, typeId: String, key: String, archivedAt: String? = nil
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: key, sortOrder: 0, kind: .measurement,
            cardinality: .one, required: false, storage: .stored, fixedUnit: "lm",
            archivedAt: archivedAt)
    }

    private static var base: InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: ancestor, key: "bedding", label: "Bedding", sortOrder: 0),
                InventoryCatalogueType(
                    id: child, key: "sheet", label: "Sheet", sortOrder: 1,
                    fields: [field(RebaseFixture.lumens, typeId: child, key: "lumens")],
                    parentTypeId: ancestor),
            ])
    }

    private static var target: InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 2, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: ancestor, key: "bedding", label: "Bedding", sortOrder: 0,
                    fields: [field(replacement, typeId: ancestor, key: "brightness")]),
                InventoryCatalogueType(
                    id: child, key: "sheet", label: "Sheet", sortOrder: 1,
                    fields: [
                        field(
                            RebaseFixture.lumens, typeId: child, key: "lumens",
                            archivedAt: archivedAt)
                    ], parentTypeId: ancestor),
            ])
    }

    @Test("a replacement field declared by an ancestor accepts the moved value")
    func replacementInAncestorMoves() throws {
        let replica = try InventoryReplica()
        let item = InventoryItem(
            id: RebaseFixture.lampId, revision: 1, seq: 1, catalogueRevision: 1, name: "Sheet",
            typeId: Self.child, typeKey: "sheet", placement: .hand,
            createdAt: Fixture.created, updatedAt: Fixture.created)
        try replica.apply(
            InventorySnapshotPage(
                epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "c1", total: 1,
                items: [item], locations: [], nextCursor: nil, catalogueRevision: 1),
            catalogue: Self.base)
        try replica.store(Self.target)

        let command = InventoryCommand.editProtocol2Item(
            id: RebaseFixture.lampId, catalogueRevision: 1,
            values: [
                InventoryProtocol2FieldPatch(
                    fieldId: RebaseFixture.lumens, values: [try RebaseFixture.measurement()])
            ])
        let change = InventoryCatalogueChange(
            definition: .field, id: RebaseFixture.lumens, typeId: Self.child,
            fieldId: RebaseFixture.lumens, change: .replaced, replacementId: Self.replacement,
            revision: 2)
        let verdict = try replica.database.read { db in
            try CatalogueRebase.rebase(
                RebaseFixture.entry(command), onto: 2, known: [change], in: db)
        }

        guard case .rebased(.command(.editProtocol2Item(_, 2, let patches)), 2) = verdict else {
            Issue.record("expected the ancestor replacement to move, got \(verdict)")
            return
        }
        #expect(patches.map(\.fieldId) == [Self.replacement])
    }
}
