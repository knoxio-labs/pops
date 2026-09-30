import AppCore
import Testing

@testable import FeatureInventory

/// A control writing back the value it already shows marks its field
/// touched; a rename made alongside must still send no field patch, or the
/// edit carries the item onto the current catalogue revision for nothing.
@MainActor
@Suite("Protocol 2 edit patches")
internal struct InventoryProtocol2EditPatchTests {
    private static let typeId = "box-type"

    private static func field(
        _ id: String, _ kind: InventoryPrimitiveKind, unit: String? = nil
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: id, label: id, sortOrder: 0, kind: kind,
            cardinality: .one, required: false, storage: .stored, fixedUnit: unit)
    }

    private static let unpack = field("unpack", .shortText)
    private static let width = field("width", .measurement, unit: "cm")
    private static let stackable = field("stackable", .boolean)

    private static func stored(
        _ field: InventoryCatalogueField, _ value: InventoryPrimitiveValue
    ) -> InventoryItemFieldEntry {
        InventoryItemFieldEntry(
            fieldId: field.id, state: .value([value]), source: .stored, catalogueRevision: 20)
    }

    private struct OpenForm {
        let form: InventoryItemFormModel
        let store: RecordingFormStore
        let loading: Task<Void, Never>
    }

    private static func open() async throws -> OpenForm {
        let type = InventoryCatalogueType(
            id: typeId, key: "box", label: "Box", sortOrder: 0,
            fields: [unpack, width, stackable])
        let item = InventoryItem(
            id: "box", revision: 1, seq: 1, catalogueRevision: 20, name: "Books 1",
            typeId: typeId, typeKey: "box",
            fieldValues: [
                stored(unpack, .string("Office")),
                stored(width, .measurement(amount: try InventoryDecimal("45"), unit: "cm")),
                stored(stackable, .boolean(true)),
            ],
            placement: .hand, createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [item],
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 24, minimumProtocol: 2),
                    types: [type])))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        return OpenForm(form: form, store: store, loading: await form.startAndAwaitReady())
    }

    @Test("a rename with every field written back unchanged sends only the rename")
    func unchangedWriteBacksSendNoPatch() async throws {
        let opened = try await Self.open()
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store
        for field in [Self.unpack, Self.width] {
            let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
            form.protocol2Draft?.setText(entry.input, entryId: entry.id, for: field)
        }
        let flag = try #require(form.protocol2Draft?.draftEntries(for: Self.stackable).first)
        form.protocol2Draft?.setValue(.boolean(true), entryId: flag.id, for: Self.stackable)
        form.draft.name = "Books 2"

        #expect(await form.submit())
        #expect(
            store.performed == [
                .editItem(id: "box", name: "Books 2", note: .unchanged, fields: [:])
            ])
    }

    @Test("clearing a field still patches it")
    func clearedFieldStillPatches() async throws {
        let opened = try await Self.open()
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store
        let entry = try #require(form.protocol2Draft?.draftEntries(for: Self.unpack).first)
        form.protocol2Draft?.setText("", entryId: entry.id, for: Self.unpack)

        #expect(await form.submit())
        #expect(
            store.performed == [
                .editProtocol2Item(
                    id: "box", catalogueRevision: 24,
                    values: [.init(fieldId: Self.unpack.id, values: nil)])
            ])
    }
}
