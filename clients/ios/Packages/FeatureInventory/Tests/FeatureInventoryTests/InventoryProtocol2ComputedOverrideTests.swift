import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Computed field overrides in the item form")
internal struct InventoryProtocol2ComputedOverrideTests {
    private static let width = InventoryCatalogueField(
        id: "width", typeId: "box-type", key: "width", label: "Width", sortOrder: 0,
        kind: .integer, cardinality: .one, required: false, storage: .stored)
    private static let volume = InventoryCatalogueField(
        id: "volume", typeId: "box-type", key: "volume", label: "Volume", sortOrder: 1,
        kind: .shortText, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 1, expression: .object([:]), allowOverride: true)
    private static let sealed = InventoryCatalogueField(
        id: "sealed", typeId: "box-type", key: "sealed", label: "Sealed", sortOrder: 2,
        kind: .boolean, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 1, expression: .object([:]), allowOverride: false)
    private static let type = InventoryCatalogueType(
        id: "box-type", key: "box", label: "Box", sortOrder: 0, fields: [width, volume, sealed])

    private static func item(
        computed: [InventoryCatalogueField: InventoryComputedEvaluation],
        fieldValues: [InventoryItemFieldEntry] = [], revision: Int = 3
    ) -> InventoryItem {
        InventoryItem(
            id: "box", revision: revision, seq: revision, catalogueRevision: 4, name: "Box",
            typeId: type.id, typeKey: "box", fieldValues: fieldValues,
            computedValues: computed.map { field, evaluation in
                InventoryComputedValue(
                    fieldId: field.id, catalogueRevision: 4, evaluation: evaluation,
                    dependencies: [], traversedItemIds: ["box"], evaluatedItemRevision: revision)
            },
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
    }

    private struct Opened {
        let form: InventoryItemFormModel
        let store: RecordingFormStore
        let loading: Task<Void, Never>
    }

    private static func opened(_ item: InventoryItem) async -> Opened {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [item],
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
                    types: [type])))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        return Opened(form: form, store: store, loading: loading)
    }

    @Test("a field the catalogue allows overriding can be set and cleared")
    func allowedOverrideOffersSetAndClear() async {
        let opened = await Self.opened(Self.item(computed: [Self.volume: .ok(.string("6 l"))]))
        defer { opened.loading.cancel() }
        let row = InventoryProtocol2ComputedFieldRow(
            field: Self.volume, display: opened.form.protocol2ComputedDisplays[Self.volume.id],
            overridesEnabled: opened.form.mode == .edit)

        #expect(row.canStartOverride)
        #expect(!row.canClearOverride)
    }

    @Test("a field the catalogue disallows overriding never offers to start one")
    func disallowedOverrideStaysReadOnly() async {
        let opened = await Self.opened(Self.item(computed: [Self.sealed: .ok(.boolean(true))]))
        defer { opened.loading.cancel() }
        let row = InventoryProtocol2ComputedFieldRow(
            field: Self.sealed, display: opened.form.protocol2ComputedDisplays[Self.sealed.id],
            overridesEnabled: opened.form.mode == .edit)

        #expect(!row.canStartOverride)
        #expect(!row.canClearOverride)
    }

    @Test("setting an override dispatches item.setOverride and clearing dispatches item.clearOverride")
    func setThenClear() async throws {
        let opened = await Self.opened(Self.item(computed: [Self.volume: .ok(.string("6 l"))]))
        defer { opened.loading.cancel() }

        await opened.form.setComputedOverride(.string("9 l"), for: Self.volume)
        guard case .setComputedOverride(let id, let fieldId, let value)? = opened.store.performed
            .first
        else {
            Issue.record("expected item.setOverride")
            return
        }
        #expect(id == "box")
        #expect(fieldId == Self.volume.id)
        #expect(value == .string("9 l"))

        await opened.form.clearComputedOverride(for: Self.volume)
        guard case .clearComputedOverride(let clearedId, let clearedFieldId)? = opened.store
            .performed.last
        else {
            Issue.record("expected item.clearOverride")
            return
        }
        #expect(clearedId == "box")
        #expect(clearedFieldId == Self.volume.id)
    }

    @Test("an override value composes and clears the same way a stored entry does")
    func overrideEntryComposesLikeAStoredEntry() {
        // The override editor and a stored field's editor share
        // `InventoryProtocol2DraftEntry`'s mutating methods (so "Cancel" on
        // an in-progress override, which just discards the local entry
        // without calling `setComputedOverride`, needs nothing store-side to
        // undo). This exercises that shared parsing directly.
        var entry = InventoryProtocol2DraftEntry(id: "override")
        entry.setText("9 l", for: Self.volume)
        #expect(entry.value == .string("9 l"))
        #expect(entry.issue == nil)

        entry.setValue(nil)
        #expect(entry.value == nil)
        #expect(entry.input == "")
    }

    @Test("an unavailable computed value still offers an override when the catalogue allows one")
    func unavailableValueCanStillBeOverridden() async {
        let opened = await Self.opened(
            Self.item(
                computed: [
                    Self.volume: .unavailable(reason: "missing_dependency", failedFieldId: "width")
                ]))
        defer { opened.loading.cancel() }
        let row = InventoryProtocol2ComputedFieldRow(
            field: Self.volume, display: opened.form.protocol2ComputedDisplays[Self.volume.id],
            overridesEnabled: opened.form.mode == .edit)

        #expect(
            row.text(referenceLabel: { _ in nil }, dependencyLabel: { _ in "Width" })
                == "Unavailable until Width is set")
        #expect(row.canStartOverride)

        await opened.form.setComputedOverride(.string("6 l"), for: Self.volume)
        guard case .setComputedOverride(_, _, let value)? = opened.store.performed.first else {
            Issue.record("expected item.setOverride even while the computed value is unavailable")
            return
        }
        #expect(value == .string("6 l"))
    }

    @Test("the form reads item.computedValues, not the legacy fieldValues cache")
    func readsComputedValuesNotFieldValues() async {
        // A field with a fresh server evaluation in `computedValues` but no
        // matching entry in `fieldValues` (the wire shape #5035 replaced):
        // the old `InventoryProtocol2Draft.computed` dictionary, built only
        // from `item.fieldValues` where `source != .stored`, would see
        // nothing here and read the field as unavailable. Reading
        // `item.computedValues` through `display(in:revisionOf:)` must show
        // the calculated value instead.
        let opened = await Self.opened(
            Self.item(computed: [Self.volume: .ok(.string("6 l"))], fieldValues: []))
        defer { opened.loading.cancel() }

        #expect(opened.form.protocol2ComputedDisplays[Self.volume.id] == .value(.string("6 l")))
    }

    @Test("a protocol-1 item never gains computed-field state")
    func protocol1ItemUnaffected() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-item" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.protocol2Draft == nil)
        #expect(form.protocol2ComputedDisplays.isEmpty)
    }
}
