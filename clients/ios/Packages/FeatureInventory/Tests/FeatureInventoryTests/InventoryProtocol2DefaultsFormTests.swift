import AppCore
import Testing

@testable import FeatureInventory

/// POPS-4846: a type picked while creating starts each field at its catalogue
/// default; an edit never does, and no default lands on a value the person
/// already set.
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

    @Test("a new item starts without a type and submits an untyped create")
    func createStartsUntyped() async throws {
        let opened = await Self.opened(.create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store

        #expect(form.protocol2Draft == nil)
        #expect(form.protocol2Type == nil)
        #expect(form.offersNoType)
        #expect(!form.hasStagedWork)

        form.draft.name = "Desk lamp"
        #expect(await form.submit())
        guard case .createItem(let created)? = store.performed.first else {
            Issue.record("expected an untyped create")
            return
        }
        #expect(created.typeKey == nil)
        #expect(created.fields.isEmpty)
    }

    @Test("editing an item leaves its empty fields empty")
    func editDoesNotPrefill() async throws {
        let opened = await Self.opened(.edit("item-1"), items: [Self.item(typeId: Self.lamp)])
        defer { opened.loading.cancel() }
        let form = opened.form
        let store = opened.store
        let draft = try #require(form.protocol2Draft)

        #expect(form.protocol2Type?.id == Self.lamp)
        #expect(draft.values(for: Self.finish).isEmpty)
        #expect(draft.values(for: Self.tags).isEmpty)
        #expect(draft.values(for: Self.dimmable) == [.boolean(false)])

        form.selectProtocol2Type(Self.cable)
        #expect(form.protocol2Draft?.values(for: Self.connector).isEmpty == true)
        #expect(store.performed.isEmpty)
    }

    @Test("picking a type while creating keeps what was typed and fills its defaults")
    func typeSwitchPrefills() async throws {
        let opened = await Self.opened(.create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form
        form.draft.name = "Charger lead"

        form.selectProtocol2Type(Self.cable)

        #expect(form.draft.name == "Charger lead")
        #expect(form.protocol2Draft?.typeSelectionChanged == true)
        #expect(form.protocol2Draft?.values(for: Self.connector) == [.string("USB-C")])
        #expect(form.hasStagedWork)
    }

    @Test("selecting no type clears a create draft")
    func createCanClearType() async throws {
        let opened = await Self.opened(.create(placement: nil))
        defer { opened.loading.cancel() }
        let form = opened.form

        form.selectProtocol2Type(Self.cable)
        #expect(form.protocol2Draft?.typeId == Self.cable)

        form.selectProtocol2Type(nil)

        #expect(form.protocol2Draft == nil)
        #expect(form.protocol2Type == nil)
        #expect(form.offersNoType)
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
