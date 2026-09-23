import AppCore
import Foundation

@testable import InventoryReplica

/// A box type whose `volume` is `width × depth` (overridable) and whose
/// `shelfDepth` reads `depth` through the `shelf` reference, for the replica's
/// local-evaluation tests.
internal enum LocalComputedFixture {
    static let revision = 3
    static let typeId = "30000000-0000-4000-8000-000000000001"
    static let width = "30000000-0000-4000-8000-000000000011"
    static let depth = "30000000-0000-4000-8000-000000000012"
    static let shelf = "30000000-0000-4000-8000-000000000013"
    static let volume = "30000000-0000-4000-8000-000000000021"
    static let shelfDepth = "30000000-0000-4000-8000-000000000022"
    static let box = "30000000-0000-4000-8000-000000000101"
    static let rack = "30000000-0000-4000-8000-000000000102"
    static let elsewhere = "30000000-0000-4000-8000-000000000103"
    static let time = Fixture.created

    static func read(_ fieldId: String, via path: [String] = []) -> InventoryJSON {
        .object([
            "op": .string("read"), "path": .array(path.map(InventoryJSON.string)),
            "fieldId": .string(fieldId),
        ])
    }

    static func field(
        _ id: String, key: String, kind: InventoryPrimitiveKind, expression: InventoryJSON? = nil,
        allowOverride: Bool = false
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: key, sortOrder: 0, kind: kind,
            cardinality: .one, required: false, storage: expression == nil ? .stored : .computed,
            references: InventoryReferenceConstraint(
                targetKinds: kind == .reference ? [.item] : []),
            expressionVersion: expression == nil ? nil : 1, expression: expression,
            allowOverride: allowOverride)
    }

    static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
        types: [
            InventoryCatalogueType(
                id: typeId, key: "box", label: "Box", sortOrder: 0,
                fields: [
                    field(width, key: "width", kind: .decimal),
                    field(depth, key: "depth", kind: .decimal),
                    field(shelf, key: "shelf", kind: .reference),
                    field(
                        volume, key: "volume", kind: .decimal,
                        expression: .object([
                            "op": .string("multiply"), "left": read(width), "right": read(depth),
                        ]), allowOverride: true),
                    field(
                        shelfDepth, key: "shelfDepth", kind: .decimal,
                        expression: read(depth, via: [shelf])),
                ])
        ])

    static func decimal(_ text: String) throws -> InventoryPrimitiveValue {
        .decimal(try InventoryDecimal(text))
    }

    static func stored(_ fieldId: String, _ value: InventoryPrimitiveValue)
        -> InventoryItemFieldEntry
    {
        InventoryItemFieldEntry(
            fieldId: fieldId, state: .value([value]), source: .stored, catalogueRevision: revision)
    }

    static func item(
        _ id: String, revision: Int = 1, values: [InventoryItemFieldEntry],
        computed: [InventoryComputedValue] = []
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: revision, catalogueRevision: Self.revision, name: id,
            typeId: typeId, typeKey: "box", fieldValues: values, computedValues: computed,
            placement: .hand, createdAt: time, updatedAt: time)
    }

    static func ok(
        _ fieldId: String, _ value: InventoryPrimitiveValue, itemRevision: Int,
        dependencies: [InventoryValueDependency], traversed: [String]
    ) -> InventoryComputedValue {
        InventoryComputedValue(
            fieldId: fieldId, catalogueRevision: revision, evaluation: .ok(value),
            dependencies: dependencies, traversedItemIds: traversed,
            evaluatedItemRevision: itemRevision)
    }

    /// A box 2.0 wide and 3 deep on a rack 40 deep, carrying the server's
    /// evaluations of both computed fields at revision 1. The server's volume
    /// is spelt `6.00`, which the phone's own evaluation (`6.0`) never is, so
    /// a test can tell whose value it is reading.
    static func seededRows() throws -> [InventoryItem] {
        let boxRow = item(
            box,
            values: [
                stored(width, try decimal("2.0")), stored(depth, try decimal("3")),
                stored(
                    shelf, .reference(InventoryReferenceValue(targetKind: .item, targetId: rack))),
            ],
            computed: [
                ok(
                    volume, try decimal("6.00"), itemRevision: 1,
                    dependencies: [
                        InventoryValueDependency(itemId: box, fieldId: width, revision: 1),
                        InventoryValueDependency(itemId: box, fieldId: depth, revision: 1),
                    ], traversed: [box]),
                ok(
                    shelfDepth, try decimal("40"), itemRevision: 1,
                    dependencies: [
                        InventoryValueDependency(itemId: box, fieldId: shelf, revision: 1),
                        InventoryValueDependency(itemId: rack, fieldId: depth, revision: 1),
                    ], traversed: [box, rack]),
            ])
        return [boxRow, item(rack, values: [stored(depth, try decimal("40"))])]
    }

    static func snapshot(_ items: [InventoryItem]) -> InventorySnapshotPage {
        InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "cat-1",
            total: items.count, items: items, locations: [], nextCursor: nil,
            catalogueRevision: revision)
    }

    static func changes(_ items: [InventoryItem]) -> InventoryChangesPage {
        InventoryChangesPage(
            epoch: Fixture.epoch, items: items, locations: [], events: [], nextSince: 20,
            hasMore: false, catalogueVersion: "cat-1", catalogueRevision: revision)
    }

    static func display(_ replica: InventoryReplica, _ itemId: String, _ fieldId: String) throws
        -> InventoryComputedDisplay?
    {
        guard let item = try replica.read(.item(id: itemId)) else { return nil }
        return item.computedValues.first { $0.fieldId == fieldId }?.display(in: item) { other in
            (try? replica.read(.item(id: other)))??.revision
        }
    }
}
