import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Missing inputs of an unavailable computed value")
internal struct InventoryMissingInputsTests {
    private static let width = InventoryCatalogueField(
        id: "width", typeId: "box-type", key: "width", label: "Width", sortOrder: 0,
        kind: .decimal, cardinality: .one, required: false, storage: .stored)
    private static let volume = InventoryCatalogueField(
        id: "volume", typeId: "box-type", key: "volume", label: "Volume", sortOrder: 1,
        kind: .decimal, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 2, expression: .object([:]), allowOverride: true)
    private static let depth = InventoryCatalogueField(
        id: "depth", typeId: "rack-type", key: "depth", label: "Depth", sortOrder: 0,
        kind: .decimal, cardinality: .one, required: false, storage: .stored)
    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
        types: [
            InventoryCatalogueType(
                id: "box-type", key: "box", label: "Box", sortOrder: 0, fields: [width, volume]),
            InventoryCatalogueType(
                id: "rack-type", key: "rack", label: "Rack", sortOrder: 1, fields: [depth]),
        ])

    private static func input(_ reason: String, _ fieldId: String, _ itemId: String)
        -> InventoryExpressionMissingInput
    {
        InventoryExpressionMissingInput(reason: reason, fieldId: fieldId, itemId: itemId)
    }

    private static func box(
        reason: String = "missing_dependency", failedFieldId: String = "width",
        traversed: [String] = ["box"], missingInputs: [InventoryExpressionMissingInput] = [],
        evaluatedRevision: Int = 3
    ) -> InventoryItem {
        InventoryItem(
            id: "box", revision: 3, seq: 3, catalogueRevision: 4, name: "Box",
            typeId: "box-type", typeKey: "box", fieldValues: [],
            computedValues: [
                InventoryComputedValue(
                    fieldId: volume.id, catalogueRevision: 4,
                    evaluation: .unavailable(reason: reason, failedFieldId: failedFieldId),
                    dependencies: [], traversedItemIds: traversed,
                    evaluatedItemRevision: evaluatedRevision, missingInputs: missingInputs)
            ],
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
    }

    private static let rack = InventoryItem(
        id: "rack", revision: 1, seq: 1, catalogueRevision: 4, name: "Rack", typeId: "rack-type",
        typeKey: "rack", fieldValues: [], placement: .hand, createdAt: FormFixture.epoch,
        updatedAt: FormFixture.epoch)

    private static func volumeLine(_ item: InventoryItem) throws -> InventoryDetailField {
        let source = FormFixtureSource(items: [item, rack], protocol2Catalogue: catalogue)
        let detail = try #require(
            InventoryItemDetail(reading: source, id: item.id, now: FormFixture.epoch))
        return try #require(detail.otherFields.first { $0.key == volume.id })
    }

    @Test("every missing input is listed by field and item under a count")
    func listsEveryInput() throws {
        let line = try Self.volumeLine(
            Self.box(
                failedFieldId: "depth", traversed: ["box", "rack"],
                missingInputs: [
                    Self.input("missing_dependency", "width", "box"),
                    Self.input("missing_dependency", "depth", "rack"),
                ]))

        #expect(line.value == "Unavailable until 2 values are set")
        #expect(line.source == .unavailable)
        #expect(line.missingInputs.map(\.text) == ["Width · Box", "Depth · Rack"])
    }

    @Test("a value stored before the list existed falls back to its failing field")
    func fallsBackToFailedField() throws {
        let own = try Self.volumeLine(Self.box())
        #expect(own.value == "Unavailable until Width is set")
        #expect(own.missingInputs.isEmpty)

        let elsewhere = try Self.volumeLine(
            Self.box(failedFieldId: "depth", traversed: ["box", "rack"]))
        #expect(elsewhere.value == "Unavailable until Depth on Rack is set")
        #expect(elsewhere.missingInputs.map(\.text) == ["Depth · Rack"])
    }

    @Test("an input that is not simply unset says why, and the summary counts them")
    func namesWhyAnInputIsMissing() throws {
        let line = try Self.volumeLine(
            Self.box(
                reason: "reference_deleted", failedFieldId: "depth",
                missingInputs: [
                    Self.input("reference_deleted", "depth", "gone"),
                    Self.input("missing_dependency", "width", "box"),
                    Self.input("missing_dependency", "width", "box"),
                ]))

        #expect(line.value == "Unavailable: 2 values are missing")
        #expect(
            line.missingInputs.map(\.text) == ["Depth · Unknown item (deleted)", "Width · Box"])
    }

    @Test("a reference not yet on this phone and one that no longer exists say so")
    func namesReferenceReasonsNotYetHereOrGone() throws {
        let line = try Self.volumeLine(
            Self.box(
                reason: "reference_unresolved", failedFieldId: "depth",
                missingInputs: [
                    Self.input("reference_unresolved", "depth", "rack"),
                    Self.input("reference_missing", "width", "box"),
                ]))

        #expect(line.value == "Unavailable: 2 values are missing")
        #expect(
            line.missingInputs.map(\.text)
                == ["Depth · Rack (not here yet)", "Width · Box (missing)"])
    }

    @Test("a failed calculation lacks no input")
    func evaluationErrorListsNothing() throws {
        let line = try Self.volumeLine(
            Self.box(reason: "evaluation_error", failedFieldId: "volume"))

        #expect(line.value == "Unavailable because the calculation failed")
        #expect(line.missingInputs.isEmpty)
    }

    @Test("a value out of date lists nothing it no longer describes")
    func outOfDateListsNothing() throws {
        let line = try Self.volumeLine(
            Self.box(
                missingInputs: [
                    Self.input("missing_dependency", "width", "box"),
                    Self.input("missing_dependency", "depth", "rack"),
                ], evaluatedRevision: 2))

        #expect(line.value == "Out of date")
        #expect(line.missingInputs.isEmpty)
    }

    @Test("the item form names the same inputs, falling back the same way")
    func formNamesInputs() async {
        let item = Self.box(
            failedFieldId: "depth", traversed: ["box", "rack"],
            missingInputs: [
                Self.input("missing_dependency", "width", "box"),
                Self.input("missing_dependency", "depth", "rack"),
            ])
        let store = RecordingFormStore(
            FormFixtureSource(items: [item, Self.rack], protocol2Catalogue: Self.catalogue))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        let row = InventoryProtocol2ComputedFieldRow(
            field: Self.volume, display: form.protocol2ComputedDisplays[Self.volume.id],
            overridesEnabled: true,
            missingInputs: form.protocol2ComputedMissingInputs[Self.volume.id] ?? [])

        #expect(row.text(referenceLabel: { _ in nil }) == "Unavailable until 2 values are set")
        #expect(row.listedMissingInputs.map(\.text) == ["Width · Box", "Depth · Rack"])
    }

    @Test("a long list shows its first three and discloses the rest")
    func disclosesALongList() {
        let inputs = (1...5).map {
            InventoryMissingInput(
                id: "\($0)", field: "Field \($0)", item: "Box", isOnOwnItem: true,
                reason: .missingDependency)
        }

        let collapsed = InventoryMissingInputsList.visible(inputs, expanded: false)
        #expect(collapsed.shown.map(\.id) == ["1", "2", "3"])
        #expect(collapsed.hidden == 2)
        #expect(InventoryMissingInputsList.visible(inputs, expanded: true).shown.count == 5)
        #expect(
            InventoryMissingInputsList.visible(Array(inputs.prefix(4)), expanded: false).hidden == 0
        )
    }
}
