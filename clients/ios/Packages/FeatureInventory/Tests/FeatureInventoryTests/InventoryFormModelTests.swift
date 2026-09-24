import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item form: creating, the code, and offline")
internal struct InventoryFormModelTests {
    private func model(
        _ store: some InventoryStore, request: InventoryItemFormRequest = .create(placement: nil),
        suggester: InventoryCodeSuggester = .unbound
    ) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: request, store: store, suggester: suggester, mintId: { "new-1" })
    }

    @Test("create sends one item.create carrying the code, and nothing after it")
    func createCarriesItsCode() async throws {
        let store = RecordingFormStore(
            FormFixtureSource(
                locations: [
                    InventoryLocation(
                        id: "loc-1", revision: 1, seq: 1, name: "Garage", parentId: nil,
                        sortOrder: 0)
                ], catalogue: FormFixture.catalogue))
        let form = model(store, request: .create(placement: .location("loc-1")))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        #expect(form.draft.placementName == "Garage")
        form.draft.name = "  Drill "
        form.codeChanged(to: " B412 ")

        #expect(await form.submit())

        guard store.performed.count == 1, case .createItem(let item) = store.performed[0] else {
            Issue.record("expected one create, got \(store.performed)")
            return
        }
        #expect(item.id == "new-1")
        #expect(item.name == "Drill")
        #expect(item.placement == .location("loc-1"))
        #expect(item.code == "B412")
    }

    @Test("create without a code sends a create with no code")
    func blankCodeSendsNoCode() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Drill"
        form.codeChanged(to: "   ")

        #expect(await form.submit())
        guard store.performed.count == 1, case .createItem(let item) = store.performed[0] else {
            Issue.record("expected one create, got \(store.performed)")
            return
        }
        #expect(item.code == nil)
    }

    @Test("a missing name blocks create even with no code collision")
    func missingNameBlocksCreate() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(!form.canSubmit)
        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)
    }

    @Test("an item's own code is not a collision when editing it")
    func ownCodeIsNotACollision() async {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [FormFixture.item("item-9", "Kitchen 09", code: "B412")],
                catalogue: FormFixture.catalogue))
        let form = model(store, request: .edit("item-9"))
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.checkCode()

        #expect(form.draft.code.heldBy == nil)
        #expect(form.draft.code.value == "B412")
    }

    @Test("offline shows the offline assist state and asks the server nothing")
    func offlineShowsOfflineAssist() async {
        let store = RecordingFormStore(
            FormFixtureSource(
                catalogue: FormFixture.catalogue, status: .offline(lastRefreshAt: nil)))
        let asked = Counter()
        let form = model(
            store,
            suggester: InventoryCodeSuggester { _, _, _ in
                await asked.increment()
                return ["B1"]
            })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.draft.code.assist == .offline)
        #expect(!form.draft.code.assist.canSuggest)
        await form.suggestCode()
        #expect(await asked.value == 0)
        #expect(form.draft.code.value.isEmpty)

        store.setStatus(.current)
        #expect(await form.await { form.draft.code.assist == .idle })
    }

    @Test(
        "a suggestion fills the code, is accepted once confirmed free, and typing over it is an edit"
    )
    func suggestionIsAcceptedThenEdited() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(
            store, suggester: InventoryCodeSuggester { _, _, _ in ["CBL-0042", "CBL-0043"] })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()
        #expect(form.draft.code.value == "CBL-0042")
        #expect(form.draft.code.assist == .accepted)
        #expect(form.draft.code.heldBy == nil)

        form.codeChanged(to: "CBL-0042-A")
        #expect(form.draft.code.assist == .edited(suggested: "CBL-0042"))
    }

    @Test("a suggestion that turns out to be held stays offered, not accepted")
    func suggestionAlreadyHeldIsNotAccepted() async {
        let store = RecordingFormStore(
            FormFixtureSource(
                items: [FormFixture.item("item-9", "Kitchen 09", code: "CBL-0042")],
                catalogue: FormFixture.catalogue))
        let form = model(
            store, suggester: InventoryCodeSuggester { _, _, _ in ["CBL-0042"] })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()

        #expect(form.draft.code.heldBy == "Kitchen 09")
        #expect(form.draft.code.assist == .offered(alternatives: []))
    }

    @Test("a server that cannot suggest shows unavailable, not an error")
    func unboundSuggesterIsUnavailable() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()

        #expect(form.draft.code.assist == .unavailable)
        #expect(form.failure == nil)
    }

    /// Distinct from ``unboundSuggesterIsUnavailable``: a phone that cannot
    /// reach bfm at all is offline, not merely told the pillar cannot
    /// suggest one right now. POPS-4107 conflated the two behind one icon;
    /// the states themselves (`InventoryCodeAssist`) already kept them
    /// apart, so this pins the suggester side of that distinction.
    @Test("the suggest call itself failing to reach bfm shows offline, not unavailable")
    func suggesterTransportFailureShowsOfflineAssist() async {
        let store = RecordingFormStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(
            store,
            suggester: InventoryCodeSuggester { _, _, _ in
                throw RepositoryError.transport("no route to bfm")
            })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()

        #expect(form.draft.code.assist == .offline)
        #expect(form.draft.code.value.isEmpty)
        #expect(form.failure == nil)
    }

    @Test("a create lands in the in-memory store with its code and identifiers")
    func createLandsInTheStore() async throws {
        let store = InMemoryInventoryStore(catalogue: FormFixture.catalogue)
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Laptop"
        form.draft.pendingIdentifier = "SN-4471"
        form.codeChanged(to: "B7")

        #expect(await form.submit())

        var created = store.observe(.item(id: "new-1")).makeAsyncIterator()
        let observed = try #require(await created.next())
        let item = try #require(observed)
        #expect(item.code == "B7")
        #expect(item.externalIds == [InventoryExternalIdentifier(kind: "serial", value: "SN-4471")])
        #expect(item.placement == .hand)
    }
}

internal actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}
