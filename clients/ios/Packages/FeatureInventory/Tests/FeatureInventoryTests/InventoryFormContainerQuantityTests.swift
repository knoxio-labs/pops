import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// ADR-002 D3: a container's quantity is always 1. Mirrors the server's
/// coverage of `quantity_container_conflict` on the form's own state, before
/// a mutation is ever sent.
@MainActor
@Suite("Item form: the quantity control locks for a container type (ADR-002 D3)")
internal struct InventoryFormContainerQuantityTests {
    private func model(
        _ store: some InventoryStore, request: InventoryItemFormRequest = .create(placement: nil)
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: request, store: store, suggester: .unbound, mintId: { "new-1" })
    }

    @Test("a container type reports itself as one; a non-container type does not")
    func selectedTypeIsContainerReflectsTheCatalogue() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(!form.selectedTypeIsContainer)
        form.draft.typeKey = "storage_box"
        #expect(form.selectedTypeIsContainer)
        form.draft.typeKey = "cable"
        #expect(!form.selectedTypeIsContainer)
    }

    @Test("selecting a container type clamps quantity to 1")
    func selectingContainerTypeClampsQuantity() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.quantity = 5

        form.selectLegacyType("storage_box")

        #expect(form.draft.quantity == 1)
        #expect(form.selectedTypeIsContainer)
    }

    @Test("selecting a non-container type leaves a grouped quantity untouched")
    func selectingNonContainerTypeKeepsQuantity() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.quantity = 5

        form.selectLegacyType("cable")

        #expect(form.draft.quantity == 5)
    }

    /// A container stored grouped before D3 was enforced: the locked control
    /// shows 1, so saving has to send 1 rather than keep the stale count.
    @Test("editing a container stored with quantity 2 saves it back to 1")
    func editingGroupedContainerCorrectsQuantity() async {
        let stored = InventoryItem(
            id: "bin-1", revision: 1, seq: 1, name: "Bin", typeKey: "storage_box",
            quantity: InventoryQuantity(count: 2), placement: .hand,
            createdAt: FormFixture.epoch, updatedAt: FormFixture.epoch)
        let store = RecordingFormStore(
            FormFixtureSource(items: [stored], catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit("bin-1"))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.draft.quantity == 1)
        #expect(await form.submit())
        #expect(store.performed == [.setItemQuantity(id: "bin-1", quantity: 1)])
    }
}
