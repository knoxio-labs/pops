import AppCore
import Testing

@testable import FeatureInventory

@Suite("Duplicate: the copy's code")
internal struct InventoryCodeBumpTests {
    @Test(
        "the trailing number is incremented, keeping its padding and growing on overflow",
        arguments: [
            ("BOX-007", "BOX-008"),
            ("A-09", "A-10"),
            ("A-99", "A-100"),
            ("7", "8"),
            ("9", "10"),
            ("B412", "B413"),
            ("X-0999", "X-1000"),
            ("R2D2", "R2D3"),
            ("12345678901234567899", "12345678901234567900"),
        ])
    func bumpsTrailingDigits(code: String, expected: String) {
        #expect(InventoryCodeSequence.bumped(code) == expected)
    }

    @Test(
        "a code with no trailing number, or no code at all, copies to an empty code",
        arguments: [String?.none, "", "SHELF", "BOX-7A", "A-"])
    func noTrailingDigitsIsEmpty(code: String?) {
        #expect(InventoryCodeSequence.bumped(code) == "")
    }
}

@MainActor
@Suite("Duplicate: New item filled in as a copy")
internal struct InventoryFormDuplicateTests {
    private static let colour = InventoryCatalogueField(
        id: "colour", typeId: "box-type", key: "colour", label: "Colour", sortOrder: 0,
        kind: .shortText, cardinality: .one, required: false, storage: .stored)
    private static let volume = InventoryCatalogueField(
        id: "volume", typeId: "box-type", key: "volume", label: "Volume", sortOrder: 1,
        kind: .shortText, cardinality: .one, required: false, storage: .computed,
        expressionVersion: 1, expression: .object([:]), allowOverride: true)
    private static let type = InventoryCatalogueType(
        id: "box-type", key: "box", label: "Box", sortOrder: 0, fields: [colour, volume])
    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 4, minimumProtocol: 2), types: [type])
    private static let garage = InventoryLocation(
        id: "loc-1", revision: 1, seq: 1, name: "Garage", parentId: nil, sortOrder: 0)

    private static let source = InventoryItem(
        id: "src", revision: 3, seq: 3, catalogueRevision: 4, name: "Blue box",
        typeId: type.id, typeKey: type.key,
        fieldValues: [
            InventoryItemFieldEntry(
                fieldId: colour.id, state: .value([.string("Blue")]), source: .stored,
                catalogueRevision: 4),
            InventoryItemFieldEntry(
                fieldId: volume.id, state: .value([.string("9 l")]), source: .override,
                catalogueRevision: 4),
        ],
        note: "Top shelf", code: "BOX-007",
        externalIds: [InventoryExternalIdentifier(kind: "serial", value: "SN-1")],
        quantity: InventoryQuantity(count: 3), placement: .location(garage.id),
        photos: [
            InventoryPhotoReference(sha256: "hash-a", caption: nil),
            InventoryPhotoReference(sha256: "hash-b", caption: "Lid"),
        ],
        createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)

    private struct Opened {
        let form: InventoryItemFormModel
        let store: RecordingFormStore
        let loading: Task<Void, Never>
    }

    private static func duplicating(
        _ id: InventoryItem.ID = source.id, others: [InventoryItem] = []
    ) async -> Opened {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [source] + others, locations: [garage], protocol2Catalogue: catalogue))
        let form = InventoryItemFormModel(
            request: .duplicate(id), store: store, suggester: .unbound, mintId: { "copy-1" })
        let loading = await form.startAndAwaitReady()
        return Opened(form: form, store: store, loading: loading)
    }

    @Test("the copy opens as a create under a new id, with the code bumped")
    func opensAsACreate() async {
        let opened = await Self.duplicating()
        defer { opened.loading.cancel() }
        let draft = opened.form.draft

        #expect(opened.form.phase == .ready)
        #expect(opened.form.mode == .create)
        #expect(opened.form.title == "New item")
        #expect(draft.id == "copy-1")
        #expect(draft.code.value == "BOX-008")
    }

    @Test("name, note, quantity, placement, values, overrides and photos are carried")
    func carriesTheSourceItem() async {
        let opened = await Self.duplicating()
        defer { opened.loading.cancel() }
        let draft = opened.form.draft

        #expect(draft.name == "Blue box")
        #expect(draft.note == "Top shelf")
        #expect(draft.quantity == 3)
        #expect(draft.placement == .location(Self.garage.id))
        #expect(draft.placementName == "Garage")
        #expect(draft.photos.map(\.sha256) == ["hash-a", "hash-b"])
        #expect(draft.photos.allSatisfy { $0.isReadyToAttach })
        #expect(opened.form.protocol2Draft?.typeId == Self.type.id)
        #expect(opened.form.protocol2Draft?.values(for: Self.colour) == [.string("Blue")])
        #expect(opened.form.protocol2Draft?.overrides == [Self.volume.id: .string("9 l")])
    }

    @Test("a serial belongs to one unit, so identifiers are not carried")
    func identifiersAreNotCarried() async {
        let opened = await Self.duplicating()
        defer { opened.loading.cancel() }

        #expect(opened.form.draft.identifiers.isEmpty)
        #expect(opened.form.draft.externalIds.isEmpty)
    }

    @Test("Create makes a new item and attaches the source's photos to it, never to the source")
    func createCopiesWithoutTouchingTheSource() async throws {
        let opened = await Self.duplicating()
        defer { opened.loading.cancel() }

        #expect(await opened.form.submit())

        let performed = opened.store.performed
        #expect(performed.count == 3)
        guard case .createProtocol2Item(let created)? = performed.first else {
            Issue.record("expected a protocol-2 create first, got \(performed)")
            return
        }
        #expect(created.id == "copy-1")
        #expect(created.name == "Blue box")
        #expect(created.typeId == Self.type.id)
        #expect(created.code == "BOX-008")
        #expect(created.note == "Top shelf")
        #expect(created.quantity == 3)
        #expect(created.placement == .location(Self.garage.id))
        #expect(created.values == [.init(fieldId: Self.colour.id, values: [.string("Blue")])])
        #expect(created.overrides == [.init(fieldId: Self.volume.id, values: [.string("9 l")])])
        #expect(created.externalIds.isEmpty)
        #expect(
            Array(performed.dropFirst()) == [
                .attachPhoto(itemId: "copy-1", sha256: "hash-a", position: 0),
                .attachPhoto(itemId: "copy-1", sha256: "hash-b", position: 1),
            ])
        #expect(!performed.contains { $0.entityId == Self.source.id })
    }

    @Test("a photo that fails to attach after the create is reported, and never re-creates")
    func failedAttachNeverCreatesTwice() async {
        let opened = await Self.duplicating()
        defer { opened.loading.cancel() }
        opened.store.fail("attachPhoto")

        #expect(await opened.form.submit() == false)
        #expect(opened.form.failure != nil)
        #expect(await opened.form.submit() == false)

        let creates = opened.store.performed.filter {
            if case .createProtocol2Item = $0 { return true }
            return false
        }
        #expect(creates.count == 1)
    }

    @Test("the bumped code goes through the same availability check as a typed one")
    func bumpedCodeIsChecked() async {
        let holder = FormFixture.item("other", "Red box", code: "BOX-008")
        let opened = await Self.duplicating(others: [holder])
        defer { opened.loading.cancel() }

        await opened.form.checkCode()

        #expect(opened.form.draft.code.heldBy == "Red box")
        #expect(!opened.form.canSubmit)
    }

    @Test("duplicating an item that has gone is unavailable")
    func missingSourceIsUnavailable() async {
        let opened = await Self.duplicating("gone")
        defer { opened.loading.cancel() }

        #expect(opened.form.phase == .unavailable)
    }

    @Test("a protocol-1 item copies its type and fields, and an uncounted code copies to empty")
    func legacyItemCopies() async {
        let legacy = FormFixture.item(
            "cable-1", "Charging cable", code: "SHELF", typeKey: "cable",
            fields: ["end_a": .choice("USB-C")])
        let store = RecordingFormStore(
            FormFixtureSource(items: [legacy], catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .duplicate(legacy.id), store: store, suggester: .unbound,
            mintId: { "copy-2" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.mode == .create)
        #expect(form.draft.code.normalized == nil)
        #expect(await form.submit())
        guard case .createItem(let created)? = store.performed.first else {
            Issue.record("expected a protocol-1 create")
            return
        }
        #expect(created.id == "copy-2")
        #expect(created.typeKey == "cable")
        #expect(created.fields == ["end_a": .choice("USB-C")])
        #expect(created.code == nil)
    }
}
