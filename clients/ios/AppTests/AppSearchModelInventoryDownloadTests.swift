import AppCore
import AppCoreFakes
import FeatureInventory
import FeaturePurchases
import Testing

@testable import Pops

/// `AppSearchModel`'s Inventory download and type-list surface — split from
/// `AppSearchModelTests` only to keep that suite under the file's line cap.
/// See `AppTests/README.md` for why this lives outside a package.
@Suite("App search model: Inventory download and types")
@MainActor
internal struct AppSearchModelInventoryDownloadTests {
    private typealias InventoryFake = ScriptedSearchProvider<Int, InventorySearchFilter>
    private typealias PurchasesFake = ScriptedSearchProvider<Int, PurchasesSearchFilter>
    private typealias Model = AppSearchModel<InventoryFake, PurchasesFake>

    @Test("loading Inventory types reads them once Inventory is available")
    func loadInventoryTypesReadsTheList() async {
        let expected = [InventoryTypeName(key: "tool", name: "Tool")]
        let model = Self.bothAvailable(inventoryTypeNames: { expected })

        await model.loadInventoryTypes()

        #expect(model.inventoryTypes == expected)
    }

    @Test("loading Inventory types is a no-op while Inventory is not available")
    func loadInventoryTypesSkipsWhenInventoryUnavailable() async {
        let model = Model(
            tabOrder: [.purchases, .inventory],
            inventoryProvider: nil,
            purchasesProvider: PurchasesFake(pillar: .purchases),
            inventoryTypeNames: { [InventoryTypeName(key: "tool", name: "Tool")] })

        await model.loadInventoryTypes()

        #expect(model.inventoryTypes.isEmpty)
    }

    @Test("downloading Inventory calls the download once, re-asks it and reloads its types")
    func downloadInventoryReasksAndReloadsTypes() async {
        let inventory = InventoryFake(
            pillar: .inventory,
            scripts: [
                "cable": [[Self.step(.results([1]))], [Self.step(.results([1, 2]))]]
            ])
        var downloadCalls = 0
        let model = Self.bothAvailable(
            inventory: inventory,
            downloadInventory: { downloadCalls += 1 },
            inventoryTypeNames: { [InventoryTypeName(key: "tool", name: "Tool")] })
        model.query = "cable"
        #expect(await Self.eventually { await inventory.askedQueries() == ["cable"] })

        await model.downloadInventory()

        #expect(downloadCalls == 1)
        #expect(await Self.eventually { await inventory.askedQueries() == ["cable", "cable"] })
        #expect(model.inventoryTypes == [InventoryTypeName(key: "tool", name: "Tool")])
        #expect(!model.inventoryDownloadFailed)
    }

    @Test("a failed download is surfaced and Inventory is not re-asked")
    func downloadInventoryFailureSurfacesAndSkipsReask() async {
        let inventory = InventoryFake(
            pillar: .inventory, scripts: ["cable": [[Self.step(.results([1]))]]])
        struct Boom: Error {}
        let model = Self.bothAvailable(
            inventory: inventory,
            downloadInventory: { throw Boom() })
        model.query = "cable"
        #expect(await Self.eventually { await inventory.askedQueries() == ["cable"] })

        await model.downloadInventory()

        #expect(model.inventoryDownloadFailed)
        #expect(await inventory.askedQueries() == ["cable"])
    }

    @Test("clearing a download failure resets the flag")
    func clearInventoryDownloadFailureResets() async {
        let model = Self.bothAvailable(downloadInventory: {
            struct Boom: Error {}
            throw Boom()
        })
        await model.downloadInventory()
        #expect(model.inventoryDownloadFailed)

        model.clearInventoryDownloadFailure()

        #expect(!model.inventoryDownloadFailed)
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
