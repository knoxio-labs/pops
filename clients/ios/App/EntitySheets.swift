import AppCore
import FeatureAccounts
import FeatureInventory
import FeaturePurchases
import FeatureTransactions
import SwiftUI

/// Presents records opened by a pops URL over the current screen.
@MainActor
internal struct EntitySheets: ViewModifier {
    private let presentation: EntityPresentation
    private let dependencies: AppDependencies
    private let entityRouter: any EntityRouter

    internal init(
        presentation: EntityPresentation,
        dependencies: AppDependencies,
        entityRouter: any EntityRouter
    ) {
        self.presentation = presentation
        self.dependencies = dependencies
        self.entityRouter = entityRouter
    }

    internal func body(content: Content) -> some View {
        @Bindable var presentation = self.presentation
        content
            .sheet(item: $presentation.inventory) { entity in
                InventoryEntityView(
                    entity: entity, dependencies: dependencies, entityRouter: entityRouter)
            }
            .sheet(item: $presentation.transaction) { entity in
                TransactionEntityView(entity: entity, dependencies: dependencies)
            }
            .sheet(item: $presentation.account) { entity in
                AccountEntityView(entity: entity, dependencies: dependencies)
            }
            .sheet(item: $presentation.purchase) { entity in
                PurchaseEntityView(entity: entity, dependencies: dependencies)
            }
    }
}
