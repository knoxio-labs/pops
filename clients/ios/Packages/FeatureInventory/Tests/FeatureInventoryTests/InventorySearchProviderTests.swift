import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@Suite("Inventory universal search provider")
internal struct InventorySearchProviderTests {
    private typealias Fixture = InventoryListFixture

    @Test("provider results preserve the existing search query and ranking")
    internal func parity() async throws {
        let store = Self.store()
        let filter = InventorySearchFilter()
        var direct = store.observe(
            InventorySearchResults.query(text: "gar", includeInactive: false, scannedIDs: [])
        ).makeAsyncIterator()
        let expected = try #require(await direct.next()).hits(query: "gar", filter: filter)
        var provided = InventorySearchProvider(store: store).answers(
            to: "gar", filter: filter
        ).makeAsyncIterator()

        let actual = try #require(Self.results(await provided.next()))

        #expect(actual.map(\.hit) == expected)
    }

    @Test("first-launch stream becomes results after download")
    internal func firstLaunchThenDownload() async throws {
        let store = Self.store()
        store.setReplicaStatus(.empty)
        var events = InventorySearchProvider(store: store).answers(
            to: "gar", filter: InventorySearchFilter()
        ).makeAsyncIterator()

        #expect(Self.isNotOnPhone(await events.next()))
        try await store.download()
        let results = try #require(Self.results(await events.next()))

        #expect(
            results.map(\.hit.name)
                == ["Garden gloves", "Garden hose", "Garage", "Rake for the garden"])
    }

    @Test("a store ending without an answer becomes failed")
    internal func endedStore() async {
        var events = InventorySearchProvider(store: EndedInventoryStore()).answers(
            to: "gar", filter: InventorySearchFilter()
        ).makeAsyncIterator()

        #expect(Self.isFailed(await events.next()))
        #expect(await events.next() == nil)
    }

    @Test("include-inactive and placement filters change the answer")
    internal func filters() async throws {
        let store = Self.store()
        var inclusive = InventorySearchFilter()
        inclusive.includesInactive = true
        var inclusiveEvents = InventorySearchProvider(store: store).answers(
            to: "gar", filter: inclusive
        ).makeAsyncIterator()
        let inclusiveResults = try #require(Self.results(await inclusiveEvents.next()))

        var inHand = InventorySearchFilter()
        inHand.placement = .inHand
        var handEvents = InventorySearchProvider(store: store).answers(
            to: "gar", filter: inHand
        ).makeAsyncIterator()
        let handResults = try #require(Self.results(await handEvents.next()))

        #expect(inclusiveResults.map(\.hit.name).contains("Garden chair"))
        #expect(handResults.map(\.hit.name) == ["Garden gloves"])
    }

    @Test("replica writes yield a second result without another provider call")
    internal func observesWrites() async throws {
        let store = Self.store()
        var events = InventorySearchProvider(store: store).answers(
            to: "garden", filter: InventorySearchFilter()
        ).makeAsyncIterator()
        let first = try #require(Self.results(await events.next()))

        _ = try await store.perform(
            .editItem(
                id: "hose", name: "Workshop hose", note: .unchanged, fields: [:]))
        let second = try #require(Self.results(await events.next()))

        #expect(first.map(\.hit.name).contains("Garden hose"))
        #expect(!second.map(\.hit.name).contains("Garden hose"))
    }

    @Test("download rethrows the store's failure")
    internal func downloadFailurePropagates() async {
        await #expect(throws: RepositoryError.self) {
            try await InventorySearchProvider(store: EndedInventoryStore()).download()
        }
    }

    @Test("download resolves, and the replica answers again once it does")
    internal func downloadSucceeds() async throws {
        let store = Self.store()
        store.setReplicaStatus(.empty)
        var events = InventorySearchProvider(store: store).answers(
            to: "gar", filter: InventorySearchFilter()
        ).makeAsyncIterator()
        #expect(Self.isNotOnPhone(await events.next()))

        try await InventorySearchProvider(store: store).download()

        #expect(Self.results(await events.next()) != nil)
    }

    @Test("current type names are empty when the catalogue has none")
    internal func currentTypeNamesEmptyWithoutCatalogue() async {
        let emptyCatalogue = InventoryCatalogue(version: "v1", units: [], types: [])
        let store = InMemoryInventoryStore(items: [], locations: [], catalogue: emptyCatalogue)

        let types = await InventorySearchProvider(store: store).currentTypeNames()

        #expect(types.isEmpty)
    }

    @Test("current type names reflect the replica's catalogue")
    internal func currentTypeNamesReflectReplica() async {
        let store = Self.store()

        let types = await InventorySearchProvider(store: store).currentTypeNames()

        var direct = store.observe(
            InventorySearchResults.query(text: "", includeInactive: false, scannedIDs: [])
        ).makeAsyncIterator()
        let expected = await direct.next()?.types

        #expect(types == (expected ?? []))
    }

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("hose", "Garden hose", at: .location("garage"), code: "G12"),
                Fixture.item(
                    "chair", "Garden chair", at: .location("garage"), lifecycle: .discarded),
                Fixture.item("rake", "Rake for the garden", at: .location("garage")),
                Fixture.item("gloves", "Garden gloves", at: .hand),
            ],
            locations: [
                Fixture.location("home", "Home"),
                Fixture.location("garage", "Garage", parent: "home"),
            ],
            catalogue: Fixture.catalogue)
    }

    private static func results(
        _ event: SearchProviderEvent<InventorySearchResult>?
    ) -> [InventorySearchResult]? {
        guard case .results(let results) = event else { return nil }
        return results
    }

    private static func isNotOnPhone(
        _ event: SearchProviderEvent<InventorySearchResult>?
    ) -> Bool {
        guard case .notOnPhone = event else { return false }
        return true
    }

    private static func isFailed(_ event: SearchProviderEvent<InventorySearchResult>?) -> Bool {
        guard case .failed = event else { return false }
        return true
    }
}
