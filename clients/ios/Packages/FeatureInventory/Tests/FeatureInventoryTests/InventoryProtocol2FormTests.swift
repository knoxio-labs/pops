import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Protocol 2 item form integration")
internal struct InventoryProtocol2ItemFormTests {
    @Test("an offline protocol-2 create queues the validated stable-ID value")
    func offlineCreate() async throws {
        let field = Self.field()
        let type = Self.type(field: field)
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 9, minimumProtocol: 2),
            types: [type])
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: catalogue, status: .offline(lastRefreshAt: nil)))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-item" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        form.selectProtocol2Type(type.id)
        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("USB-C", entryId: entry.id, for: field)

        #expect(await form.submit())
        guard case .createProtocol2Item(let item)? = store.performed.first else {
            Issue.record("expected a protocol-2 create")
            return
        }
        #expect(item.catalogueRevision == 9)
        #expect(item.typeId == type.id)
        #expect(
            item.values == [
                InventoryProtocol2FieldValue(
                    fieldId: field.id, values: [.string("USB-C")])
            ])
    }

    @Test("local validation blocks malformed offline values before a mutation is queued")
    func offlineValidationBlocksWrite() async throws {
        let field = Self.field(kind: .integer)
        let type = Self.type(field: field)
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 2, minimumProtocol: 2),
                    types: [type]),
                status: .offline(lastRefreshAt: nil)))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        form.selectProtocol2Type(type.id)
        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("not a number", entryId: entry.id, for: field)

        #expect(await form.submit() == false)
        #expect(form.showsValidation)
        #expect(form.protocol2Issues.first?.message.contains("whole number") == true)
        #expect(store.performed.isEmpty)
    }

    @Test("a protocol-1 catalogue still takes the existing compatibility command path")
    func protocol1Compatibility() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-item" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        form.draft.typeKey = "cable"

        #expect(form.protocol2Draft == nil)
        #expect(await form.submit())
        guard case .createItem(let item)? = store.performed.first else {
            Issue.record("expected the protocol-1 create command")
            return
        }
        #expect(item.typeKey == "cable")
    }

    @Test("a protocol-2 create starts without a type and refuses archived types")
    func createStartsWithoutType() async {
        let archived = InventoryCatalogueType(
            id: "archived", key: "archived", label: "Archived", sortOrder: 0,
            archivedAt: "2026-09-01")
        let active = Self.type(field: Self.field())
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
                    types: [archived, active])))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .ready)
        #expect(form.protocol2Draft == nil)
        #expect(form.protocol2Type == nil)
        #expect(form.offersNoType)
        form.selectProtocol2Type(archived.id)
        #expect(form.protocol2Draft == nil)
    }

    @Test("create is unavailable when the catalogue has no active type")
    func createWithNoActiveType() async {
        let archived = InventoryCatalogueType(
            id: "archived", key: "archived", label: "Archived", sortOrder: 0,
            archivedAt: "2026-09-01")
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
                    types: [archived])))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .unavailable)
        form.draft.name = "Cable"
        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)
    }

    @Test("generic field and type edits make a create draft worth preserving")
    func protocol2WorkParticipatesInDiscardProtection() async throws {
        let field = Self.field()
        let first = Self.type(field: field)
        let second = InventoryCatalogueType(
            id: "second", key: "second", label: "Second", sortOrder: 1)
        let store = RecordingFormStore(
            FormFixtureSource(
                protocol2Catalogue: InventoryCatalogueSnapshot(
                    revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
                    types: [first, second])))
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(!form.hasStagedWork)
        form.selectProtocol2Type(first.id)
        #expect(form.hasStagedWork)
        let entry = try #require(form.protocol2Draft?.draftEntries(for: field).first)
        form.protocol2Draft?.setText("USB-C", entryId: entry.id, for: field)
        #expect(form.hasStagedWork)

        let fresh = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound)
        let freshLoading = await fresh.startAndAwaitReady()
        defer { freshLoading.cancel() }
        fresh.selectProtocol2Type(second.id)
        #expect(fresh.hasStagedWork)
    }

    @Test("an edit of a typed item cannot clear its type")
    func typedEditRefusesNoType() async throws {
        let field = Self.field()
        let type = Self.type(field: field)
        let item = InventoryItem(
            id: "item-1", revision: 1, seq: 1, catalogueRevision: 3, name: "Cable",
            typeId: type.id, typeKey: type.key, fieldValues: [], placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2), types: [type])
        let store = RecordingFormStore(
            FormFixtureSource(items: [item], protocol2Catalogue: catalogue))
        let form = InventoryItemFormModel(
            request: .edit(item.id), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        form.selectProtocol2Type(nil)

        #expect(form.protocol2Draft?.typeId == type.id)
    }

    private static func type(field: InventoryCatalogueField) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: "type-id", key: "cable", label: "Cable", sortOrder: 0, fields: [field])
    }

    private static func field(
        kind: InventoryPrimitiveKind = .shortText
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "field-id", typeId: "type-id", key: "connector", label: "Connector",
            sortOrder: 0, kind: kind, cardinality: .one, required: true, storage: .stored)
    }
}
