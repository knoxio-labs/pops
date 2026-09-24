import AppCore
import FeatureInventory
import FeaturePurchases

extension AppComposition {
    /// The app-wide search model for `dependencies`, with every reader it needs bound: the two
    /// providers, Inventory's download and type names, and the Purchases repository that
    /// ``AppSearchModel/loadTags()`` reads the tag vocabulary from.
    internal func searchModel(
        for dependencies: AppDependencies, available: Set<MobileFeature>
    ) -> AppSearchModel<InventorySearchProvider, PurchasesSearchProvider> {
        let providers = searchProviders(for: dependencies)
        return AppSearchModel(
            tabOrder: SearchPillar.allCases.filter { available.contains($0.feature) },
            inventoryProvider: providers.inventory,
            purchasesProvider: providers.purchases,
            purchasesRepository: dependencies.purchases,
            downloadInventory: providers.inventory.download,
            inventoryTypeNames: providers.inventory.currentTypeNames)
    }
}
