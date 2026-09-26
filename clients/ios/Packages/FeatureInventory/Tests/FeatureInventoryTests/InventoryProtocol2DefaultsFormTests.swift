import AppCore
import Testing

@testable import FeatureInventory

/// POPS-4846: a new item's form starts each field at its type's catalogue
/// default, and so does a type picked while creating; an edit never does, and
/// no default lands on a value the person already set.
@MainActor
@Suite("Protocol 2 item form field defaults")
internal struct InventoryProtocol2DefaultsFormTests {
    private static let lamp = "lamp"
    private static let cable = "cable"

    private static let finish = InventoryCatalogueField(
        id: "finish", typeId: lamp, key: "finish", label: "Finish", sortOrder: 0,
        kind: .shortText, cardinality: .one, required: false, storage: .stored,
        defaultValues: [.string("Matte")])
    private static let tags = InventoryCatalogueField(
        id: "tags", typeId: lamp, key: "tags", label: "Tags", sortOrder: 1, kind: .shortText,
        cardinality: .many, required: false, storage: .stored,
        defaultValues: [.string("warm"), .string("dimmable")])
    private static let dimmable = InventoryCatalogueField(
        id: "dimmable", typeId: lamp, key: "dimmable", label: "Dimmable", sortOrder: 2,
        kind: .boolean, cardinality: .one, required: true, storage: .stored,
        defaultValues: [.boolean(true)])
    private static let note = InventoryCatalogueField(
        id: "note", typeId: lamp, key: "note", label: "Note", sortOrder: 3, kind: .shortText,
        cardinality: .one, required: false, storage: .stored)
    private static let connector = InventoryCatalogueField(
        id: "connector", typeId: cable, key: "connector", label: "Connector", sortOrder: 0,
        kind: .shortText, cardinality: .one, required: false, storage: .stored,
        defaultValues: [.string("USB-C")])

    private static let lampType = InventoryCatalogueType(
        id: lamp, key: "lamp", label: "Lamp", sortOrder: 0,
        fields: [finish, tags, dimmable, note])
    private static let cableType = InventoryCatalogueType(
        id: cable, key: "cable", label: "Cable", sortOrder: 1, fields: [connector])

    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 5, minimumProtocol: 2),
        types: [lampType, cableType])

    private struct Opened {
        let form: InventoryItemFormModel
        let store: RecordingFormStore
        let loading: Task<Void, Never>
    }

    private static func opened(
        _ request: InventoryItemFormRequest, items: [InventoryItem] = []
    ) async -> Opened {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: items, protocol2Catalogue: catalogue, status: .offline(lastRefreshAt: nil)))
        let form = InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, mintId: { "new-item" })
        let loading = await form.startAndAwaitReady()
        return Opened(form: form, store: store, loading: loading)
    }

    private static func item(typeId: String) -> InventoryItem {
        InventoryItem(
            id: "item-1", revision: 1, seq: 1, catalogueRevision: 5, name: "Desk lamp",
            typeId: typeId, typeKey: typeId, fieldValues: [], placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
    }

    @Test("a new item starts every field at its default and sends them")
    func createPrefills() async throws {
        let opened = await Self.opened(.create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store
        let draft = try #require(form.protocol2Draft)

        #expect(draft.values(for: Self.finish) == [.string("Matte")])
        #expect(draft.values(for: Self.tags) == [.string("warm"), .string("dimmable")])
        #expect(draft.values(for: Self.dimmable) == [.boolean(true)])
        #expect(draft.values(for: Self.note).isEmpty)
        #expect(!form.hasStagedWork)

        form.draft.name = "Desk lamp"
        #expect(await form.submit())
        guard case .createProtocol2Item(let created)? = store.performed.first else {
            Issue.record("expected a protocol-2 create")
            return
        }
        #expect(
            created.values == [
                InventoryProtocol2FieldValue(fieldId: "finish", values: [.string("Matte")]),
                InventoryProtocol2FieldValue(
                    fieldId: "tags", values: [.string("warm"), .string("dimmable")]),
                InventoryProtocol2FieldValue(fieldId: "dimmable", values: [.boolean(true)]),
            ])
    }

    @Test("editing an item leaves its empty fields empty")
    func editDoesNotPrefill() async throws {
        let opened = await Self.opened(.edit("item-1"), items: [Self.item(typeId: Self.lamp)])
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store
        let draft = try #require(form.protocol2Draft)

        #expect(draft.values(for: Self.finish).isEmpty)
        #expect(draft.values(for: Self.tags).isEmpty)
        #expect(draft.values(for: Self.dimmable) == [.boolean(false)])

        form.selectProtocol2Type(Self.cable)
        #expect(form.protocol2Draft?.values(for: Self.connector).isEmpty == true)
        #expect(store.performed.isEmpty)
    }

    @Test("picking another type while creating keeps what was typed and fills its defaults")
    func typeSwitchPrefills() async throws {
        let opened = await Self.opened(.create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form
        form.draft.name = "Charger lead"

        form.selectProtocol2Type(Self.cable)

        #expect(form.draft.name == "Charger lead")
        #expect(form.protocol2Draft?.values(for: Self.connector) == [.string("USB-C")])
        #expect(form.hasStagedWork)
    }

    @Test("a default never replaces a value the person set")
    func defaultsNeverOverwrite() throws {
        var draft = InventoryProtocol2Draft(type: Self.lampType, catalogueRevision: 5)
        let finishEntry = try #require(draft.draftEntries(for: Self.finish).first)
        draft.setText("Gloss", entryId: finishEntry.id, for: Self.finish)
        draft.addEntry(id: "tag-1", for: Self.tags)
        draft.removeEntry(id: "tag-1", for: Self.tags)

        draft.prefillDefaults(for: Self.lampType)

        #expect(draft.values(for: Self.finish) == [.string("Gloss")])
        #expect(draft.values(for: Self.tags).isEmpty)
        #expect(draft.values(for: Self.dimmable) == [.boolean(true)])
        #expect(draft.touched == ["finish", "tags"])
    }
}
