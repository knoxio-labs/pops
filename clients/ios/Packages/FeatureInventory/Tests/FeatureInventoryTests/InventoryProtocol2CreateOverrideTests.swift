import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Computed field overrides while creating an item")
internal struct InventoryProtocol2CreateOverrideTests {
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

    private struct Opened {
        let form: InventoryItemFormModel
        let store: RecordingFormStore
        let loading: Task<Void, Never>
    }

    private static func creating() async -> Opened {
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2),
                    types: [type]),
                status: .offline(lastRefreshAt: nil)))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-box" })
        let loading = await form.startAndAwaitReady()
        form.selectProtocol2Type(type.id)
        form.draft.name = "Irregular box"
        return Opened(form: form, store: store, loading: loading)
    }

    private static func row(
        _ field: InventoryCatalogueField, in form: InventoryItemFormModel
    ) -> InventoryProtocol2ComputedFieldRow {
        InventoryProtocol2ComputedFieldRow(field: field, display: form.computedDisplay(for: field))
    }

    @Test("a new item's form offers an override only where the catalogue allows one")
    func createOffersOverride() async {
        let opened = await Self.creating()
        defer { opened.loading.cancel() }

        #expect(opened.form.mode == .create)
        #expect(Self.row(Self.volume, in: opened.form).canStartOverride)
        #expect(!Self.row(Self.sealed, in: opened.form).canStartOverride)
    }

    @Test("an override set before Create is staged, shown overridden, and writes nothing yet")
    func overrideIsStagedNotPerformed() async {
        let opened = await Self.creating()
        defer { opened.loading.cancel() }

        await opened.form.setComputedOverride(.string("9 l"), for: Self.volume)

        #expect(opened.store.performed.isEmpty)
        let row = Self.row(Self.volume, in: opened.form)
        #expect(row.isOverridden)
        #expect(row.canClearOverride)
        #expect(row.text(referenceLabel: { _ in nil }) == "9 l")
    }

    @Test("Create carries the staged override inside the queued item.create")
    func submittedCreateCarriesOverride() async {
        let opened = await Self.creating()
        defer { opened.loading.cancel() }

        await opened.form.setComputedOverride(.string("9 l"), for: Self.volume)
        #expect(await opened.form.submit())

        guard case .createProtocol2Item(let item)? = opened.store.performed.first else {
            Issue.record("expected a protocol-2 create")
            return
        }
        #expect(item.overrides == [.init(fieldId: Self.volume.id, values: [.string("9 l")])])
        #expect(item.values.contains { $0.fieldId == Self.volume.id } == false)
    }

    @Test("an override cleared before Create is not sent")
    func clearedOverrideIsNotSent() async {
        let opened = await Self.creating()
        defer { opened.loading.cancel() }

        await opened.form.setComputedOverride(.string("9 l"), for: Self.volume)
        await opened.form.clearComputedOverride(for: Self.volume)
        #expect(!Self.row(Self.volume, in: opened.form).isOverridden)
        #expect(await opened.form.submit())

        guard case .createProtocol2Item(let item)? = opened.store.performed.first else {
            Issue.record("expected a protocol-2 create")
            return
        }
        #expect(item.overrides.isEmpty)
    }
}
