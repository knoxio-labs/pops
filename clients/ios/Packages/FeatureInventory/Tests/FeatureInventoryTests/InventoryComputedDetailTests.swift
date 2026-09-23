import AppCore
import Testing

@testable import FeatureInventory

@Suite("Computed fields on item detail")
internal struct InventoryComputedDetailTests {
    private static let width = InventoryCatalogueField(
        id: "width", typeId: "box-type", key: "width", label: "Width", sortOrder: 0,
        kind: .integer, cardinality: .one, required: false, storage: .stored)
    private static let volume = InventoryCatalogueField(
        id: "volume", typeId: "box-type", key: "volume", label: "Volume", sortOrder: 1,
        kind: .shortText, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 1, expression: .object([:]), allowOverride: true)
    private static let type = InventoryCatalogueType(
        id: "box-type", key: "box", label: "Box", sortOrder: 0, fields: [width, volume])

    private static func item(
        revision: Int = 3, computed: InventoryComputedEvaluation?,
        dependencies: [InventoryValueDependency] = [],
        fieldValues: [InventoryItemFieldEntry] = []
    ) -> InventoryItem {
        InventoryItem(
            id: "box", revision: revision, seq: revision, catalogueRevision: 4, name: "Box",
            typeId: type.id, typeKey: "box", fieldValues: fieldValues,
            computedValues: computed.map {
                [
                    InventoryComputedValue(
                        fieldId: volume.id, catalogueRevision: 4, evaluation: $0,
                        dependencies: dependencies, traversedItemIds: ["box"],
                        evaluatedItemRevision: 3)
                ]
            } ?? [],
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
    }

    private static func volumeLine(_ item: InventoryItem, others: [InventoryItem] = []) throws
        -> InventoryDetailField
    {
        let source = FormFixtureSource(
            items: [item] + others,
            protocol2Catalogue: InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
                types: [type]))
        let detail = try #require(
            InventoryItemDetail(reading: source, id: item.id, now: FormFixture.epoch))
        return try #require(detail.otherFields.first { $0.key == volume.id })
    }

    @Test("a calculated value is shown and marked as calculated")
    func calculated() throws {
        let line = try Self.volumeLine(Self.item(computed: .ok(.string("6 l"))))

        #expect(line.label == "Volume")
        #expect(line.value == "6 l")
        #expect(line.source == .calculated)
        #expect(line.source.caption == "Calculated")
        #expect(line.source.isMuted == false)
    }

    @Test("an override is shown as overridden, never as calculated")
    func overridden() throws {
        let override = InventoryItemFieldEntry(
            fieldId: Self.volume.id, state: .value([.string("9 l")]), source: .override,
            catalogueRevision: 4)
        let line = try Self.volumeLine(
            Self.item(
                computed: .overridden(.string("9 l"), overrideCatalogueRevision: 4),
                fieldValues: [override]))

        #expect(line.value == "9 l")
        #expect(line.source == .overridden)
        #expect(line.source.caption == "Overridden")
    }

    @Test("an unavailable value names the missing input and is muted")
    func unavailable() throws {
        let line = try Self.volumeLine(
            Self.item(computed: .unavailable(reason: "missing_dependency", failedFieldId: "width")))

        #expect(line.value == "Unavailable until Width is set")
        #expect(line.source == .unavailable)
        #expect(line.source.isMuted)
    }

    @Test("an unavailability reason this build predates still reads as unavailable")
    func unknownReason() throws {
        let line = try Self.volumeLine(
            Self.item(computed: .unavailable(reason: "quota_exceeded", failedFieldId: "volume")))

        #expect(line.value == "Unavailable")
        #expect(line.source == .unavailable)
    }

    @Test("a local edit since the evaluation shows it as out of date, not the old value")
    func invalidatedByLocalEdit() throws {
        let line = try Self.volumeLine(Self.item(revision: 4, computed: .ok(.string("6 l"))))

        #expect(line.value == "Out of date")
        #expect(line.source == .outOfDate)
        #expect(line.source.isMuted)
    }

    @Test("a newer revision of a dependency shows the value as out of date")
    func invalidatedByDependency() throws {
        let shelf = InventoryItem(
            id: "shelf", revision: 5, seq: 5, name: "Shelf", typeKey: nil, placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let item = Self.item(
            computed: .ok(.string("6 l")),
            dependencies: [InventoryValueDependency(itemId: "shelf", fieldId: "depth", revision: 4)]
        )

        #expect(try Self.volumeLine(item, others: [shelf]).source == .outOfDate)
    }

    @Test("a field with no evaluation yet waits for sync, unless the phone holds an override")
    func noEvaluationYet() throws {
        #expect(try Self.volumeLine(Self.item(computed: nil)).source == .outOfDate)

        let overridden = Self.item(
            computed: nil,
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: Self.volume.id, state: .value([.string("2 l")]), source: .override,
                    catalogueRevision: 4)
            ])
        let line = try Self.volumeLine(overridden)
        #expect(line.value == "2 l")
        #expect(line.source == .overridden)
    }
}
