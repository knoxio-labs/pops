import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Protocol 2 catalogue revisions")
internal struct InventoryProtocol2CatalogueRevisionTests {}

extension InventoryProtocol2CatalogueRevisionTests {
    @Test("an open typed create uses the active catalogue after a refresh")
    func typedCreateUsesRefreshedCatalogueRevision() async throws {
        let field = Self.field()
        let type = Self.type(field: field)
        let catalogue = Self.catalogue(type: type, revision: 3)
        let refreshed = Self.catalogue(type: type, revision: 4)
        let store = RecordingFormStore(FormFixtureSource(protocol2Catalogue: catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-item" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.draft.name = "Cable"
        form.selectProtocol2Type(type.id)
        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("USB-C", entryId: entry.id, for: field)
        store.setProtocol2Catalogue(refreshed)
        #expect(await form.await { form.protocol2Catalogue?.revision.revision == 4 })

        #expect(await form.submit())
        guard case .createProtocol2Item(let item)? = store.performed.first else {
            Issue.record("expected a protocol-2 create")
            return
        }
        #expect(item.catalogueRevision == 4)
    }

    @Test("an edit of a typed item sends stable patches with the active catalogue revision")
    func typedEditPatchesStableFields() async throws {
        let field = Self.field(cardinality: .many)
        let type = Self.type(field: field)
        let item = Self.item(type: type, field: field, values: ["Markus Zusak", "Another author"])
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [item], protocol2Catalogue: Self.catalogue(type: type, revision: 3)))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.draft.name = "The book thief (edited)"
        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("M. Zusak", entryId: entry.id, for: field)

        #expect(await form.submit())
        #expect(
            store.performed == [
                .editProtocol2Item(
                    id: item.id,
                    catalogueRevision: 3,
                    values: [
                        .init(
                            fieldId: field.id,
                            values: [.string("M. Zusak"), .string("Another author")])
                    ]),
                .editItem(
                    id: item.id,
                    name: "The book thief (edited)",
                    note: .unchanged,
                    fields: [:]),
            ])
    }

    @Test("an open typed edit uses the active catalogue after a refresh")
    func typedEditUsesRefreshedCatalogueRevision() async throws {
        let field = Self.field(cardinality: .many)
        let type = Self.type(field: field)
        let item = Self.item(type: type, field: field, values: ["Markus Zusak"])
        let catalogue = Self.catalogue(type: type, revision: 3)
        let refreshed = Self.catalogue(type: type, revision: 4)
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: catalogue))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("Markus Zusak (edited)", entryId: entry.id, for: field)
        store.setProtocol2Catalogue(refreshed)
        #expect(await form.await { form.protocol2Catalogue?.revision.revision == 4 })

        #expect(await form.submit())
        guard case .editProtocol2Item(_, let catalogueRevision, _)? = store.performed.first else {
            Issue.record("expected a protocol-2 edit")
            return
        }
        #expect(catalogueRevision == 4)
    }

    private static func item(
        type: InventoryCatalogueType,
        field: InventoryCatalogueField,
        values: [String]
    ) -> InventoryItem {
        InventoryItem(
            id: "typed-item",
            revision: 1,
            seq: 1,
            catalogueRevision: 3,
            name: "The book thief",
            typeId: type.id,
            typeKey: type.key,
            fieldValues: [
                InventoryItemFieldEntry(
                    fieldId: field.id,
                    state: .value(values.map { .string($0) }),
                    source: .stored,
                    catalogueRevision: 3)
            ],
            placement: .hand,
            createdAt: FormFixture.epoch,
            updatedAt: FormFixture.epoch)
    }

    private static func catalogue(
        type: InventoryCatalogueType,
        revision: Int
    ) -> InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [type])
    }

    private static func type(field: InventoryCatalogueField) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: "type-id", key: "cable", label: "Cable", sortOrder: 0, fields: [field])
    }

    private static func field(
        kind: InventoryPrimitiveKind = .shortText,
        cardinality: InventoryFieldCardinality = .one
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "field-id", typeId: "type-id", key: "connector", label: "Connector",
            sortOrder: 0, kind: kind, cardinality: cardinality, required: true, storage: .stored)
    }
}
