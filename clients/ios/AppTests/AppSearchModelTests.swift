import AppCore
import FeatureInventory
import FeaturePurchases
import Testing

@testable import Pops

/// `AppSearchModel` composes one search over every pillar this app can
/// search. Lives here rather than in a package because `App/` is in no
/// package — see `AppTests/README.md`.
@Suite("App search model")
@MainActor
internal struct AppSearchModelTests {
    private typealias InventoryFake = ScriptedSearchProvider<TestHit, InventorySearchFilter>
    private typealias PurchasesFake = ScriptedSearchProvider<TestHit, PurchasesSearchFilter>
    private typealias Model = AppSearchModel<InventoryFake, PurchasesFake>

    @Test("only Inventory's provider makes Inventory the only available pillar")
    func onlyInventoryAvailable() {
        let model = Model(
            tabOrder: [.purchases, .inventory],
            inventoryProvider: InventoryFake(pillar: .inventory),
            purchasesProvider: nil)

        #expect(model.available == [.inventory])
        #expect(model.purchases == nil)
    }

    @Test("only Purchases' provider makes Purchases the only available pillar")
    func onlyPurchasesAvailable() {
        let model = Model(
            tabOrder: [.purchases, .inventory],
            inventoryProvider: nil,
            purchasesProvider: PurchasesFake(pillar: .purchases))

        #expect(model.available == [.purchases])
        #expect(model.inventory == nil)
    }

    @Test("the available chips follow the tab bar's own order, not declaration order")
    func chipOrderFollowsTabOrder() {
        let model = Model(
            tabOrder: [.purchases, .inventory],
            inventoryProvider: InventoryFake(pillar: .inventory),
            purchasesProvider: PurchasesFake(pillar: .purchases))

        #expect(model.available == [.purchases, .inventory])
    }

    @Test("scoped search asks only the selected pillar")
    func scopedSearchAsksOnlySelectedPillar() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: ["socket": [[Self.step(.results(Self.page([1, 2])))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: ["socket": [[Self.step(.results(Self.page([9])))]]])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)
        model.scope = .pillar(.purchases)

        model.query = "socket"

        #expect(await Self.eventually { await purchases.askedQueries() == ["socket"] })
        #expect(await inventory.askedQueries().isEmpty)
        #expect(model.inventory?.hits.isEmpty == true)
    }

    @Test("All starts each provider at page one and exposes their later pages")
    func allModePagesEachAvailableProvider() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1], nextCursor: "inventory-next")))],
                    [Self.step(.results(Self.page([2])))],
                ]
            ])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([3], nextCursor: "purchases-next")))],
                    [Self.step(.results(Self.page([4])))],
                ]
            ])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)
        model.query = "tool"
        #expect(await Self.eventually { model.inventory?.hits == [TestHit(1)] })
        #expect(await Self.eventually { model.purchases?.hits == [TestHit(3)] })
        #expect(await inventory.askedCursors() == [nil])
        #expect(await purchases.askedCursors() == [nil])

        await model.inventory?.loadNextPageIfNeeded()
        await model.purchases?.loadNextPageIfNeeded()

        #expect(model.inventory?.hits == [TestHit(1), TestHit(2)])
        #expect(model.purchases?.hits == [TestHit(3), TestHit(4)])
        #expect(await inventory.askedCursors() == [nil, "inventory-next"])
        #expect(await purchases.askedCursors() == [nil, "purchases-next"])
    }

    @Test("changing scope cancels the prior provider and asks the newly selected one")
    func changingScopeSwitchesProvider() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: ["socket": [[Self.step(.results(Self.page([1])), after: .milliseconds(80))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: [
                "socket": [
                    [Self.step(.results(Self.page([2])))],
                    [Self.step(.results(Self.page([2])))],
                ]
            ])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)
        model.query = "socket"
        #expect(await Self.eventually { await inventory.askedQueries() == ["socket"] })

        model.scope = .pillar(.purchases)

        #expect(await Self.eventually { model.purchases?.hits == [TestHit(2)] })
        try? await Task.sleep(for: .milliseconds(100))
        #expect(model.inventory?.hits.isEmpty == true)
        #expect(await purchases.askedQueries() == ["socket", "socket"])
        #expect(await inventory.terminatedQueries().contains("socket"))
    }

    @Test("Purchases disappearing while scoped to it falls back to All")
    func purchasesDisappearingFallsBackToAll() {
        let model = Self.bothAvailable()
        model.scope = .pillar(.purchases)

        model.update(available: [.inventory])

        #expect(model.scope == .all)
    }

    @Test("a pillar still available keeps whatever scope named it")
    func availablePillarKeepsItsScope() {
        let model = Self.bothAvailable()
        model.scope = .pillar(.purchases)

        model.update(available: [.inventory, .purchases])

        #expect(model.scope == .pillar(.purchases))
    }

    @Test("a filter change re-asks only the selected Purchases provider")
    func purchasesFilterChangeAsksOnlyPurchases() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: ["cable": [[Self.step(.results(Self.page([1])))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: [
                "cable": [
                    [Self.step(.results(Self.page([9])))],
                    [Self.step(.results(Self.page([9])))],
                ]
            ])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)
        model.scope = .pillar(.purchases)
        model.query = "cable"
        #expect(await Self.eventually { await purchases.askedQueries() == ["cable"] })

        model.purchasesFilter = PurchasesSearchFilter(kind: .purchases)

        #expect(await Self.eventually { await purchases.askedQueries() == ["cable", "cable"] })
        #expect(await inventory.askedQueries().isEmpty)
    }

    @Test("All asks every available provider and no-results waits for both")
    func allWaitsForEachAvailablePillar() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: ["nothing": [[Self.step(.results(Self.page([])))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: [
                "nothing": [[Self.step(.results(Self.page([])), after: .milliseconds(40))]]
            ])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)

        model.query = "nothing"

        #expect(!model.hasNoResults, "Purchases has not answered yet")
        #expect(await Self.eventually { await inventory.askedQueries() == ["nothing"] })
        #expect(await Self.eventually { await purchases.askedQueries() == ["nothing"] })
        #expect(await Self.eventually { model.hasNoResults })
    }

    @Test("a pillar still holding results is not no-results")
    func hasNoResultsIsFalseWithHits() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: ["cable": [[Self.step(.results(Self.page([1])))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: ["cable": [[Self.step(.results(Self.page([])))]]])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)

        model.query = "cable"

        #expect(await Self.eventually { await inventory.askedQueries() == ["cable"] })
        #expect(await Self.eventually { await purchases.askedQueries() == ["cable"] })
        #expect(!model.hasNoResults)
    }

    private static func bothAvailable(
        inventory: InventoryFake = InventoryFake(pillar: .inventory),
        purchases: PurchasesFake = PurchasesFake(pillar: .purchases),
        downloadInventory: (() async throws -> Void)? = nil,
        inventoryTypeNames: (() async -> [InventoryTypeName])? = nil
    ) -> Model {
        Model(
            tabOrder: [.purchases, .inventory], inventoryProvider: inventory,
            purchasesProvider: purchases,
            downloadInventory: downloadInventory, inventoryTypeNames: inventoryTypeNames)
    }

    private static func page(
        _ ids: [Int], nextCursor: String? = nil, totalCount: Int? = nil
    ) -> SearchProviderPage<TestHit> {
        SearchProviderPage(
            hits: ids.map(TestHit.init), nextCursor: nextCursor, totalCount: totalCount)
    }

    private static func step(
        _ event: SearchProviderEvent<TestHit>, after delay: Duration = .zero
    ) -> ScriptedSearchStep<TestHit> {
        ScriptedSearchStep(event: event, delay: delay)
    }

    private struct TestHit: Identifiable, Sendable, Equatable {
        let id: Int

        init(_ id: Int) { self.id = id }
    }

    private static func eventually(
        _ condition: @escaping @MainActor () async -> Bool
    ) async -> Bool {
        for _ in 0..<100 {
            if await condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return false
    }
}
