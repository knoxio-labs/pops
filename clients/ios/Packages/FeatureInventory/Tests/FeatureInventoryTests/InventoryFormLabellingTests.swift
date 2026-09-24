import AppCore
import Testing

@testable import FeatureInventory

/// "Label it" used to open a placeholder ("Choosing a code for this item
/// opens here."). It now opens the real edit form, focused on the code
/// field, via `.labelling` — proof that request carries the edit form's own
/// mode and data, plus the one bit that says the code field should take the
/// keyboard.
@MainActor
@Suite("Item form: labelling opens the edit form focused on the code field")
internal struct InventoryFormLabellingTests {
    private let stored = FormFixture.item("item-1", "Cable")

    private func open(_ request: InventoryItemFormRequest) async -> InventoryItemFormModel {
        let store = RecordingFormStore(
            FormFixtureSource(items: [stored], catalogue: FormFixture.catalogue))
        let form = InventoryItemFormModel(request: request, store: store, suggester: .unbound)
        await form.startAndAwaitReady()
        return form
    }

    @Test("labelling reads and edits the same item an ordinary edit would")
    func labellingLoadsTheItem() async {
        let form = await open(.labelling("item-1"))

        #expect(form.mode == .edit)
        #expect(form.draft.name == "Cable")
        #expect(form.phase == .ready)
    }

    @Test("labelling asks for the code field's focus; an ordinary edit does not")
    func onlyLabellingAsksForFocus() async {
        let labelling = await open(.labelling("item-1"))
        let editing = await open(.edit("item-1"))

        #expect(labelling.focusesCode)
        #expect(!editing.focusesCode)
    }

    @Test("a create never asks for the code field's focus either")
    func createDoesNotAskForFocus() async {
        let source = FormFixtureSource(items: [], catalogue: FormFixture.catalogue)
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: RecordingFormStore(source),
            suggester: .unbound)

        #expect(!form.focusesCode)
    }

    @Test("labelling an item that no longer exists is unavailable, the same as an ordinary edit")
    func labellingAMissingItemIsUnavailable() async {
        let form = await open(.labelling("gone"))

        #expect(form.phase == .unavailable)
    }
}
