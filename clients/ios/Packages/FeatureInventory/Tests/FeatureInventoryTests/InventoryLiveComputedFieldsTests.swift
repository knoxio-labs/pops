import AppCore
import Testing

@testable import FeatureInventory

/// POPS-4836: the item form evaluates a computed field's expression against
/// the draft itself, live, rather than only showing what the server last
/// evaluated for a saved item.
@MainActor
@Suite("Computed fields evaluated live from the item form's draft")
internal struct InventoryLiveComputedFieldsTests {
    private static let width = InventoryCatalogueField(
        id: "width", typeId: "box-type", key: "width", label: "Width", sortOrder: 0,
        kind: .measurement, cardinality: .one, required: false, storage: .stored,
        fixedUnit: "cm")
    private static let height = InventoryCatalogueField(
        id: "height", typeId: "box-type", key: "height", label: "Height", sortOrder: 1,
        kind: .measurement, cardinality: .one, required: false, storage: .stored,
        fixedUnit: "cm")
    private static let depth = InventoryCatalogueField(
        id: "depth", typeId: "box-type", key: "depth", label: "Depth", sortOrder: 2,
        kind: .measurement, cardinality: .one, required: false, storage: .stored,
        fixedUnit: "cm")
    /// `width × height × depth`, expression version 2, matching the
    /// vendored contract vector "width × height × depth supplies a volume
    /// in L".
    private static let volume = InventoryCatalogueField(
        id: "volume", typeId: "box-type", key: "volume", label: "Volume", sortOrder: 3,
        kind: .measurement, cardinality: .one, required: false, storage: .computed,
        fixedUnit: "L", references: .init(), expressionVersion: 2,
        expression: .object([
            "op": .string("multiply"),
            "left": .object([
                "op": .string("multiply"),
                "left": .object([
                    "op": .string("read"), "path": .array([]), "fieldId": .string(width.id),
                ]),
                "right": .object([
                    "op": .string("read"), "path": .array([]), "fieldId": .string(height.id),
                ]),
            ]),
            "right": .object([
                "op": .string("read"), "path": .array([]), "fieldId": .string(depth.id),
            ]),
        ]), allowOverride: false)
    /// A computed field whose expression is not the empty object a real
    /// catalogue would ever publish: this build cannot parse it, so it must
    /// keep whatever the server last evaluated.
    private static let sealed = InventoryCatalogueField(
        id: "sealed", typeId: "box-type", key: "sealed", label: "Sealed", sortOrder: 4,
        kind: .boolean, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 1, expression: .object([:]), allowOverride: false)
    private static let type = InventoryCatalogueType(
        id: "box-type", key: "box", label: "Box", sortOrder: 0,
        fields: [width, height, depth, volume, sealed])
    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2), types: [type])

    private static func decimalMeasurement(_ amount: String, _ unit: String) throws
        -> InventoryPrimitiveValue
    {
        .measurement(amount: try InventoryDecimal(amount), unit: unit)
    }

    private static func opened(_ store: RecordingFormStore, _ request: InventoryItemFormRequest)
        async -> (form: InventoryItemFormModel, loading: Task<Void, Never>)
    {
        let form = InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, mintId: { "new-box" })
        let loading = await form.startAndAwaitReady()
        return (form, loading)
    }

    @Test("create names what's missing, then shows the volume once every input is entered")
    func createComputesLiveOnceInputsArrive() async throws {
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: Self.catalogue))
        let opened = await Self.opened(store, .create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form
        form.selectProtocol2Type(Self.type.id)

        guard
            case .unavailable(_, let firstFailure)? = form.protocol2ComputedDisplays[
                Self.volume.id]
        else {
            Issue.record("expected the volume to start unavailable")
            return
        }
        #expect(firstFailure == Self.width.id)
        #expect(form.protocol2ComputedMissingInputs[Self.volume.id]?.map(\.field) == ["Width"])

        form.protocol2Draft?.setText("10", entryId: "width:empty", for: Self.width)
        guard
            case .unavailable(_, let secondFailure)? = form.protocol2ComputedDisplays[
                Self.volume.id]
        else {
            Issue.record("expected the volume to still be unavailable after only width")
            return
        }
        #expect(secondFailure == Self.height.id)

        form.protocol2Draft?.setText("10", entryId: "height:empty", for: Self.height)
        guard
            case .unavailable(_, let thirdFailure)? = form.protocol2ComputedDisplays[
                Self.volume.id]
        else {
            Issue.record("expected the volume to still be unavailable before depth is entered")
            return
        }
        #expect(thirdFailure == Self.depth.id)

        form.protocol2Draft?.setText("10", entryId: "depth:empty", for: Self.depth)
        #expect(
            form.protocol2ComputedDisplays[Self.volume.id]
                == .value(try Self.decimalMeasurement("1.000", "L")))
        #expect(form.protocol2ComputedMissingInputs[Self.volume.id] == nil)
    }

    @Test("editing an input recomputes the value immediately, before any save")
    func editingRecomputesTheDisplayedValue() async throws {
        let item = InventoryItem(
            id: "box", revision: 3, seq: 3, catalogueRevision: 4, name: "Box",
            typeId: Self.type.id, typeKey: "box",
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: Self.width.id,
                    state: .value([try Self.decimalMeasurement("20", "cm")]), source: .stored,
                    catalogueRevision: 4),
                InventoryItemFieldEntry(
                    fieldId: Self.height.id,
                    state: .value([try Self.decimalMeasurement("30", "cm")]), source: .stored,
                    catalogueRevision: 4),
                InventoryItemFieldEntry(
                    fieldId: Self.depth.id,
                    state: .value([try Self.decimalMeasurement("20", "cm")]), source: .stored,
                    catalogueRevision: 4),
            ], placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: Self.catalogue))
        let opened = await Self.opened(store, .edit(item.id))
        defer { opened.loading.cancel() }
        let form = opened.form

        #expect(
            form.protocol2ComputedDisplays[Self.volume.id]
                == .value(try Self.decimalMeasurement("12.000", "L")))

        form.protocol2Draft?.setText("40", entryId: "\(Self.width.id):0", for: Self.width)

        #expect(
            form.protocol2ComputedDisplays[Self.volume.id]
                == .value(try Self.decimalMeasurement("24.000", "L")))
    }

    @Test("an expression this build cannot parse keeps the server's stored display")
    func unparseableExpressionFallsBackToTheStoredDisplay() async throws {
        let item = InventoryItem(
            id: "box", revision: 3, seq: 3, catalogueRevision: 4, name: "Box",
            typeId: Self.type.id, typeKey: "box",
            computedValues: [
                InventoryComputedValue(
                    fieldId: Self.sealed.id, catalogueRevision: 4,
                    evaluation: .ok(.boolean(true)), dependencies: [], traversedItemIds: ["box"],
                    evaluatedItemRevision: 3)
            ], placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: Self.catalogue))
        let opened = await Self.opened(store, .edit(item.id))
        defer { opened.loading.cancel() }
        let form = opened.form

        #expect(form.protocol2ComputedDisplays[Self.sealed.id] == .value(.boolean(true)))

        // A draft change elsewhere still runs the live recompute; it must
        // leave the unparseable field's display exactly as the server sent
        // it, not clear or replace it.
        form.protocol2Draft?.setText("10", entryId: "\(Self.width.id):empty", for: Self.width)

        #expect(form.protocol2ComputedDisplays[Self.sealed.id] == .value(.boolean(true)))
    }
}
