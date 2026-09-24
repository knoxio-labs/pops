import AppCore
import Testing

@testable import FeatureInventory

/// Edit item on a catalogue repair: the item form against the current
/// fields, the queued values that still fit filled in, the rest struck
/// through, and saving settles the repair with the edited change.
@MainActor
@Suite("Inventory catalogue repair: Edit item")
internal struct InventoryCatalogueRepairFormTests {
    private typealias Fixture = CatalogueRepairFixture

    private static func form(_ store: RecordingFormStore) -> InventoryItemFormModel {
        InventoryItemFormModel(request: .repair("m1"), store: store, suggester: .unbound)
    }

    @Test("a queued edit reopens as Edit item with what fits filled in and the rest listed")
    func editPrefill() async throws {
        let store = Fixture.store()
        let form = Self.form(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .ready)
        #expect(form.title == "Edit item")
        #expect(form.actionTitle == "Save")
        #expect(form.mode == .edit)
        #expect(form.protocol2Draft?.values(for: Fixture.length) == [.string("2 m")])
        #expect(form.protocol2Draft?.values(for: Fixture.shielding).isEmpty == true)
        #expect(form.notCarried.map(\.field) == ["Shielding"])
        #expect(form.notCarried.first?.fit == .archived)
        #expect(form.notCarried.first?.value == "Braided")
    }

    @Test("saving settles the repair with the edited change, against the current fields")
    func saveReplacesTheHeldChange() async throws {
        let store = Fixture.store()
        let form = Self.form(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(await form.submit())

        let edited = InventoryCommand.editProtocol2Item(
            id: Fixture.cableId, catalogueRevision: Fixture.revision,
            values: [.init(fieldId: Fixture.length.id, values: [.string("2 m")])])
        #expect(store.resolutions == [.replaceMine(edited)])
        #expect(store.performed.isEmpty)
    }

    @Test("a queued new item reopens with its name and values, and saves as a new item")
    func createPrefill() async throws {
        let create = InventoryCommand.createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "espresso", name: "Espresso", catalogueRevision: 1, typeId: Fixture.typeId,
                values: [
                    .init(fieldId: Fixture.length.id, values: [.string("30 cm")]),
                    .init(fieldId: Fixture.shielding.id, values: [.string("Braided")]),
                ], placement: .hand))
        let repair = Fixture.repair(
            queued: create,
            changes: [
                Fixture.change(
                    .field, Fixture.capacity.id, .nowRequired, fieldId: Fixture.capacity.id)
            ])
        let store = Fixture.store(repairs: [repair])
        let form = Self.form(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.mode == .create)
        #expect(form.draft.id == "espresso")
        #expect(form.draft.name == "Espresso")
        #expect(form.notCarried.map(\.field) == ["Shielding", "Capacity"])
        #expect(await form.submit() == false)

        let entry = try #require(form.protocol2Draft?.draftEntries(for: Fixture.capacity).first)
        form.protocol2Draft?.setText("1 l", entryId: entry.id, for: Fixture.capacity)
        #expect(await form.submit())
        guard case .replaceMine(.createProtocol2Item(let sent))? = store.resolutions.last else {
            Issue.record("expected the edited new item, got \(store.resolutions)")
            return
        }
        #expect(sent.id == "espresso")
        #expect(sent.catalogueRevision == Fixture.revision)
        #expect(Set(sent.values.map(\.fieldId)) == [Fixture.length.id, Fixture.capacity.id])
    }

    @Test("a repair that settled elsewhere leaves nothing to edit")
    func goneRepair() async throws {
        let form = Self.form(Fixture.store(repairs: []))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .unavailable)
    }

    @Test("Edit item on the repair screen marks the settling that follows as this phone's")
    func repairScreenAfterEdit() async throws {
        let store = Fixture.store()
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        #expect(model.row?.catalogue?.leadingAction == .editItem)

        model.beginEditing()
        store.setLedger(InventoryReplicaSyncLedger())

        await awaitObservedCondition { model.outcome != nil }
        #expect(model.outcome == "Sent with current fields")
    }
}
