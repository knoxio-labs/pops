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

    @Test("create sends item.create, then a dependent set-code for the same id")
    func createComposesCreateThenCode() async throws {
        let store = RecordingInventoryStore(
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
        form.codeChanged(to: "B412")

        #expect(await form.submit())

        guard store.performed.count == 2, case .createItem(let item) = store.performed[0] else {
            Issue.record("expected create then set-code, got \(store.performed)")
            return
        }
        #expect(item.id == "new-1")
        #expect(item.name == "Drill")
        #expect(item.placement == .location("loc-1"))
        #expect(store.performed[1] == .setItemCode(id: "new-1", code: "B412"))
    }

    @Test("create without a code sends no set-code")
    func blankCodeSendsNoSetCode() async {
        let store = RecordingInventoryStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Drill"
        form.codeChanged(to: "   ")

        #expect(await form.submit())
        #expect(store.performed.count == 1)
    }

    @Test("a code already held by another item blocks create, whatever its case")
    func heldCodeBlocksCreate() async {
        let store = RecordingInventoryStore(
            FormFixtureSource(
                items: [FormFixture.item("item-9", "Kitchen 09", code: "B412")],
                catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Kettle"
        form.codeChanged(to: "b412")

        #expect(await form.submit() == false)
        #expect(store.performed.isEmpty)
        #expect(form.draft.code.heldBy == "Kitchen 09")
        #expect(form.issues == [.codeTaken(heldBy: "Kitchen 09")])
        #expect(!form.canSubmit)

        form.codeChanged(to: "B413")
        await form.checkCode()
        #expect(form.draft.code.heldBy == nil)
        #expect(await form.submit())
    }

    @Test("an item's own code is not a collision when editing it")
    func ownCodeIsNotACollision() async {
        let store = RecordingInventoryStore(
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

    @Test("a code that fails after its create lands is retried alone")
    func failedCodeRetriesWithoutRecreating() async {
        let store = RecordingInventoryStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        store.fail("setCode")
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }
        form.draft.name = "Drill"
        form.codeChanged(to: "B412")

        #expect(await form.submit() == false)
        #expect(form.failure == .unavailable)
        let creates = store.performed.filter { if case .createItem = $0 { true } else { false } }
        #expect(creates.count == 1)

        _ = await form.submit()
        let createsAfterRetry = store.performed.filter {
            if case .createItem = $0 { true } else { false }
        }
        #expect(createsAfterRetry.count == 1)
        #expect(store.performed.last == .setItemCode(id: "new-1", code: "B412"))
    }

    @Test("offline shows the offline assist state and asks the server nothing")
    func offlineShowsOfflineAssist() async {
        let store = RecordingInventoryStore(
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

    @Test("a suggestion fills the code and keeps the runners-up; typing over it is an edit")
    func suggestionIsOffered() async {
        let store = RecordingInventoryStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(
            store, suggester: InventoryCodeSuggester { _, _, _ in ["CBL-0042", "CBL-0043"] })
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()
        #expect(form.draft.code.value == "CBL-0042")
        #expect(form.draft.code.assist == .offered(alternatives: ["CBL-0043"]))

        form.codeChanged(to: "CBL-0042-A")
        #expect(form.draft.code.assist == .edited(suggested: "CBL-0042"))
    }

    @Test("a server that cannot suggest shows unavailable, not an error")
    func unboundSuggesterIsUnavailable() async {
        let store = RecordingInventoryStore(FormFixtureSource(catalogue: FormFixture.catalogue))
        let form = model(store)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        await form.suggestCode()

        #expect(form.draft.code.assist == .unavailable)
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

private actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}
