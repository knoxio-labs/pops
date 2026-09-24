import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

/// POPS-4063: a code another item already wears blocks the final action,
/// offline included, and the form offers a free code in one tap.
@MainActor
@Suite("Item form: a code someone else already wears")
internal struct InventoryFormHeldCodeTests {
    private func model(
        _ store: some InventoryStore, suggester: InventoryCodeSuggester = .unbound
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: .create(placement: nil), store: store, suggester: suggester,
            mintId: { "new-1" })
    }

    /// POPS-4063: a held code blocks Create, offline included, and the form
    /// offers the next free code from this phone's replica in one tap.
    @Test("a held code blocks create offline and offers the replica's next free code")
    func heldCodeBlocksCreateOffline() async throws {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [
                    FormFixture.item("item-9", "Kitchen 09", code: "B412"),
                    FormFixture.item("item-10", "Kitchen 10", code: "B413"),
                ],
                catalogue: FormFixture.catalogue, status: .offline(lastRefreshAt: nil)))
        let asked = Counter()
        let form = model(
            store,
            suggester: InventoryCodeSuggester { _, _, _ in
                await asked.increment()
                return ["B900"]
            })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Kettle"
        form.codeChanged(to: "b412")
        await form.checkCode()

        #expect(form.draft.code.heldBy == "Kitchen 09")
        #expect(form.issues == [.codeTaken(heldBy: "Kitchen 09")])
        #expect(!form.canSubmit)
        #expect(form.freeCode == "b414")
        #expect(await asked.value == 0)
        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)

        form.useFreeCode()
        await form.checkCode()
        #expect(form.draft.code.value == "b414")
        #expect(form.draft.code.heldBy == nil)
        #expect(form.canSubmit)
        #expect(await form.submit())
        guard case .createItem(let item)? = store.performed.first else {
            Issue.record("expected a create, got \(store.performed)")
            return
        }
        #expect(item.code == "b414")
    }

    @Test("online, a held code offers the suggester's first code nobody here holds")
    func heldCodeOffersSuggestionOnline() async {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [
                    FormFixture.item("item-9", "Kitchen 09", code: "B412"),
                    FormFixture.item("item-11", "Kitchen 11", code: "B500"),
                ],
                catalogue: FormFixture.catalogue))
        let form = model(
            store, suggester: InventoryCodeSuggester { _, _, _ in ["B500", "B501"] })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Kettle"
        form.codeChanged(to: "B412")
        await form.checkCode()

        #expect(!form.canSubmit)
        #expect(form.freeCode == "B501")
    }

    @Test("a held code the replica did not know is refused by the store and blocks the same way")
    func storeCollisionBlocksAndOffersItsSuggestion() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.fail(
            "create",
            with: InventoryCommandError.codeCollision(
                heldById: "item-9", heldByName: "Kitchen 09", suggestedCode: "B413"))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Kettle"
        form.codeChanged(to: "B412")

        #expect(await form.submit() == false)

        #expect(form.draft.code.heldBy == "Kitchen 09")
        #expect(form.freeCode == "B413")
        #expect(form.failure == nil)
        #expect(!form.canSubmit)
    }
}
