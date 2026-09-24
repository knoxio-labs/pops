import AppCore
import AppCoreFakes
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
    private typealias InventoryFake = ScriptedSearchProvider<Int, InventorySearchFilter>
    private typealias PurchasesFake = ScriptedSearchProvider<Int, PurchasesSearchFilter>
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

    @Test("scoped to Purchases, Inventory is still asked and its count still shows")
    func scopedToPurchasesStillAsksInventory() async {
        let inventory = InventoryFake(
            pillar: .inventory, scripts: ["socket": [[Self.step(.results([1, 2]))]]])
        let model = Self.bothAvailable(inventory: inventory)
        model.scope = .pillar(.purchases)

        model.query = "socket"

        #expect(await Self.eventually { await inventory.askedQueries() == ["socket"] })
        #expect(await Self.eventually { model.status(for: .inventory) == .count(2) })
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

    @Test("a filter change on Purchases re-asks only Purchases")
    func purchasesFilterChangeAsksOnlyPurchases() async {
        let inventory = InventoryFake(
            pillar: .inventory, scripts: ["cable": [[Self.step(.results([1]))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: [
                "cable": [[Self.step(.results([9]))], [Self.step(.results([9]))]]
            ])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)
        model.query = "cable"
        #expect(await Self.eventually { await inventory.askedQueries() == ["cable"] })
        #expect(await Self.eventually { await purchases.askedQueries() == ["cable"] })

        model.purchasesFilter = PurchasesSearchFilter(kind: .purchases)

        #expect(await Self.eventually { await purchases.askedQueries() == ["cable", "cable"] })
        #expect(await inventory.askedQueries() == ["cable"])
    }

    @Test("no results requires every pillar in scope to be current with zero hits")
    func hasNoResultsRequiresEveryPillarCurrentAndEmpty() async {
        let inventory = InventoryFake(
            pillar: .inventory, scripts: ["nothing": [[Self.step(.results([]))]]])
        let purchases = PurchasesFake(
            pillar: .purchases,
            scripts: ["nothing": [[Self.step(.results([]), after: .milliseconds(40))]]])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)

        model.query = "nothing"

        #expect(await Self.eventually { await inventory.askedQueries() == ["nothing"] })
        #expect(!model.hasNoResults, "Purchases has not answered yet")
        #expect(await Self.eventually { model.hasNoResults })
    }

    @Test("a pillar still holding results is not no-results")
    func hasNoResultsIsFalseWithHits() async {
        let inventory = InventoryFake(
            pillar: .inventory, scripts: ["cable": [[Self.step(.results([1]))]]])
        let purchases = PurchasesFake(
            pillar: .purchases, scripts: ["cable": [[Self.step(.results([]))]]])
        let model = Self.bothAvailable(inventory: inventory, purchases: purchases)

        model.query = "cable"

        #expect(await Self.eventually { await inventory.askedQueries() == ["cable"] })
        #expect(await Self.eventually { await purchases.askedQueries() == ["cable"] })
        #expect(!model.hasNoResults)
    }

    @Test("loading tags reads the tag vocabulary from the Purchases repository")
    func loadTagsReadsVocabulary() async {
        let repository = InMemoryPurchasesRepository(
            tagsInUse: [PurchaseTagCount(tag: "garden", count: 4)])
        let model = Self.bothAvailable(purchasesRepository: repository)

        await model.loadTags()

        #expect(model.tags == [PurchaseTagCount(tag: "garden", count: 4)])
    }

    @Test("loading tags is a no-op while Purchases is not available")
    func loadTagsSkipsWhenPurchasesUnavailable() async {
        let repository = InMemoryPurchasesRepository(
            tagsInUse: [PurchaseTagCount(tag: "garden", count: 4)])
        let model = Model(
            tabOrder: [.purchases, .inventory],
            inventoryProvider: InventoryFake(pillar: .inventory),
            purchasesProvider: nil,
            purchasesRepository: repository)

        await model.loadTags()

        #expect(model.tags.isEmpty)
    }

    @Test("a failed load leaves the tag list empty")
    func loadTagsLeavesEmptyOnFailure() async {
        let repository = InMemoryPurchasesRepository(
            tagsInUse: [PurchaseTagCount(tag: "garden", count: 4)])
        await repository.fail(onCall: 1, with: .transport("boom"))
        let model = Self.bothAvailable(purchasesRepository: repository)

        await model.loadTags()

        #expect(model.tags.isEmpty)
    }

    private static func bothAvailable(
        inventory: InventoryFake = InventoryFake(pillar: .inventory),
        purchases: PurchasesFake = PurchasesFake(pillar: .purchases),
        purchasesRepository: (any PurchasesRepository)? = nil
    ) -> Model {
        Model(
            tabOrder: [.purchases, .inventory], inventoryProvider: inventory,
            purchasesProvider: purchases, purchasesRepository: purchasesRepository)
    }

    private static func step(
        _ event: SearchProviderEvent<Int>, after delay: Duration = .zero
    ) -> ScriptedSearchStep<Int> {
        ScriptedSearchStep(event: event, delay: delay)
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
