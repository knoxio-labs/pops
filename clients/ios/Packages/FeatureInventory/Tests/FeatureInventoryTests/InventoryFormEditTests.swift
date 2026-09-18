import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item form: editing sends only what changed")
internal struct InventoryFormEditTests {
    private let stored = InventoryItem(
        id: "item-1", revision: 3, seq: 7, name: "Cable", typeKey: "cable",
        fields: [
            "end_a": .choice("Micro-USB"),
            "length": .measurement(InventoryMeasurement(value: 1, unit: "m")),
        ],
        note: "Spare", code: "C1",
        externalIds: [InventoryExternalIdentifier(kind: "serial", value: "S1")],
        placement: .location("loc-1"), createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)

    private struct Opened {
        let form: InventoryItemFormModel
        let store: RecordingInventoryStore
        let loading: Task<Void, Never>
    }

    private func open() async -> Opened {
        let store = RecordingInventoryStore(
            FormFixtureSource(items: [stored], catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .edit("item-1"), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        return Opened(form: form, store: store, loading: loading)
    }

    @Test("saving an untouched item sends nothing and has nothing to discard")
    func untouchedSaveIsEmpty() async {
        let opened = await open()
        let form = opened.form
        let store = opened.store
        defer { opened.loading.cancel() }

        #expect(!form.hasStagedWork)
        #expect(await form.submit())
        #expect(store.performed.isEmpty)
    }

    @Test("a renamed item with one field changed sends one edit patching only that field")
    func editPatchesOnlyTouchedFields() async {
        let opened = await open()
        let form = opened.form
        let store = opened.store
        defer { opened.loading.cancel() }
        form.draft.name = "USB cable"
        form.draft.set(.measurement(amount: "2", unit: "m"), for: FormFixture.length)

        #expect(form.hasStagedWork)
        #expect(await form.submit())

        #expect(
            store.performed == [
                .editItem(
                    id: "item-1", name: "USB cable", note: .unchanged,
                    fields: ["length": .measurement(InventoryMeasurement(value: 2, unit: "m"))])
            ])
    }

    @Test("a cleared note, a new code, a new quantity and a move each send their own command")
    func eachKindOfChangeHasItsCommand() async {
        let opened = await open()
        let form = opened.form
        let store = opened.store
        defer { opened.loading.cancel() }
        form.draft.note = " "
        form.codeChanged(to: "")
        form.draft.quantity = 3
        form.draft.placement = .hand

        #expect(await form.submit())

        #expect(
            store.performed == [
                .editItem(id: "item-1", name: nil, note: .cleared, fields: [:]),
                .setItemCode(id: "item-1", code: nil),
                .setItemQuantity(id: "item-1", quantity: 3),
                .moveItem(id: "item-1", to: .hand, verb: .move),
            ])
    }

    @Test("an identifier added in the trailing row replaces the stored list")
    func identifiersAreSentWhole() async {
        let opened = await open()
        let form = opened.form
        let store = opened.store
        defer { opened.loading.cancel() }
        form.draft.pendingIdentifier = "M-2"
        form.draft.commitPendingIdentifier()
        form.draft.identifiers[1].kind = InventoryIdentifierDraft.Kind.model.rawValue

        #expect(await form.submit())

        #expect(
            store.performed == [
                .editItem(
                    id: "item-1", name: nil, note: .unchanged, fields: [:],
                    externalIds: [
                        InventoryExternalIdentifier(kind: "serial", value: "S1"),
                        InventoryExternalIdentifier(kind: "model", value: "M-2"),
                    ])
            ])
    }

    @Test("a type change sends change-type with the new type's fields, and no untyped option")
    func typeChangeSendsChangeType() async {
        let opened = await open()
        let form = opened.form
        let store = opened.store
        defer { opened.loading.cancel() }
        #expect(!form.offersNoType)
        form.draft.typeKey = "charger"
        form.draft.set(.measurement(amount: "65", unit: "W"), for: FormFixture.wattage)

        #expect(await form.submit())

        #expect(
            store.performed == [
                .changeItemType(
                    id: "item-1", typeKey: "charger",
                    fields: ["wattage": .measurement(InventoryMeasurement(value: 65, unit: "W"))])
            ])
    }

    @Test("an item that is gone shows the form as unavailable")
    func missingItemIsUnavailable() async {
        let store = RecordingInventoryStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(
            request: .edit("missing"), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .unavailable)
        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)
    }
}
