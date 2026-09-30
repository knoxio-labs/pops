import AppCore
import FeatureInventory
import FeaturePurchases

extension AppComposition {
    /// The app-wide search model for `dependencies`, with its providers and Inventory readers bound.
    internal func searchModel(
        for dependencies: AppDependencies, available: Set<MobileFeature>
    ) -> AppSearchModel<InventorySearchProvider, PurchasesSearchProvider> {
        let providers = searchProviders(for: dependencies)
        return AppSearchModel(
            tabOrder: SearchPillar.allCases.filter { available.contains($0.feature) },
            inventoryProvider: providers.inventory,
            purchasesProvider: providers.purchases,
            downloadInventory: providers.inventory.download,
            inventoryTypeNames: providers.inventory.currentTypeNames)
    }
}
