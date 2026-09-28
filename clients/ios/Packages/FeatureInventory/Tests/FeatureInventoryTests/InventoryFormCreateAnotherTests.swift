import AppCore
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item form: create another")
internal struct InventoryFormCreateAnotherTests {
    private func locationStore() -> RecordingFormStore {
        RecordingFormStore(
            FormFixtureSource(
                locations: [
                    InventoryLocation(
                        id: "loc-1", revision: 1, seq: 1, name: "Garage", parentId: nil,
                        sortOrder: 0)
                ], catalogue: FormFixture.catalogue))
    }

    @Test("create another keeps placement and type while minting a blank legacy draft")
    func createAnotherResetsLegacyDraft() async throws {
        let store = locationStore()
        var nextID = 0
        let form = InventoryItemFormModel(
            request: .create(placement: .location("loc-1")), store: store, suggester: .unbound,
            mintId: {
                nextID += 1
                return "new-\(nextID)"
            })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        form.selectLegacyType("cable")
        form.draft.note = "First cable"
        form.draft.quantity = 4
        form.codeChanged(to: "B412")
        let firstID = form.draft.id

        #expect(await form.submitAndPrepareForAnother())

        #expect(store.performed.count == 1)
        #expect(form.draft.id != firstID)
        #expect(form.draft.name.isEmpty)
        #expect(form.draft.typeKey == "cable")
        #expect(form.draft.placement == .location("loc-1"))
        #expect(form.draft.placementName == "Garage")
        #expect(form.draft.note.isEmpty)
        #expect(form.draft.quantity == 1)
        #expect(form.draft.code.normalized == nil)

        form.draft.name = "Second cable"
        #expect(await form.submit())
        guard case .createItem(let second)? = store.performed.last else {
            Issue.record("expected the second create")
            return
        }
        #expect(second.id != firstID)
        #expect(second.typeKey == "cable")
        #expect(second.placement == .location("loc-1"))
    }

    @Test("a failed create does not replace the draft for create another")
    func failedCreateAnotherKeepsDraft() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.fail("create")
        let form = InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: .unbound,
            mintId: { "new-1" })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Cable"
        let id = form.draft.id

        #expect(await form.submitAndPrepareForAnother() == false)
        #expect(form.draft.id == id)
        #expect(form.draft.name == "Cable")
    }
}
