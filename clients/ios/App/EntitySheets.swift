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
    private let isActive: Bool

    internal init(
        presentation: EntityPresentation,
        dependencies: AppDependencies,
        entityRouter: any EntityRouter,
        isActive: Bool
    ) {
        self.presentation = presentation
        self.dependencies = dependencies
        self.entityRouter = entityRouter
        self.isActive = isActive
    }

    internal func body(content: Content) -> some View {
        @Bindable var presentation = self.presentation
        content
            .sheet(
                item: Self.sheetBinding($presentation.inventory, isActive: isActive),
                content: { entity in
                    InventoryEntityView(
                        entity: entity, dependencies: dependencies, entityRouter: entityRouter)
                }
            )
            .sheet(
                item: Self.sheetBinding($presentation.transaction, isActive: isActive),
                content: { entity in
                    TransactionEntityView(entity: entity, dependencies: dependencies)
                }
            )
            .sheet(
                item: Self.sheetBinding($presentation.account, isActive: isActive),
                content: { entity in
                    AccountEntityView(entity: entity, dependencies: dependencies)
                }
            )
            .sheet(
                item: Self.sheetBinding($presentation.purchase, isActive: isActive),
                content: { entity in
                    PurchaseEntityView(entity: entity, dependencies: dependencies)
                }
            )
    }

    /// Makes one shared entity presentation active in exactly one presentation host.
    internal static func sheetBinding<Item: Identifiable>(
        _ source: Binding<Item?>,
        isActive: Bool
    ) -> Binding<Item?> {
        Binding(
            get: { isActive ? source.wrappedValue : nil },
            set: { value in
                guard isActive else { return }
                source.wrappedValue = value
            }
        )
    }
}
