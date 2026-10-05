import AppCore
import DesignSystem
import FeatureAccounts
import FeatureInventory
import FeaturePurchases
import FeatureTransactions
import SwiftUI

extension ContentView {
    /// Asks each feature for its whole flow; the feature owns its internal routes.
    @ViewBuilder internal func screen(for feature: MobileFeature) -> some View {
        switch feature {
        case FeatureTransactions.feature:
            TransactionsFlowView(
                dependencies: dependencies,
                router: composition.router(for: FeatureTransactions.feature))
        case FeatureAccounts.feature:
            AccountsFlowView(
                dependencies: dependencies,
                router: composition.router(for: FeatureAccounts.feature))
        case FeaturePurchases.feature:
            if let purchasesCaptureObserver {
                PurchasesFlowView(
                    dependencies: dependencies,
                    captureAvailable: surface.captureAvailable,
                    captureObserver: purchasesCaptureObserver)
            } else {
                PurchasesFlowView(
                    dependencies: dependencies,
                    captureAvailable: surface.captureAvailable)
            }
        case FeatureInventory.feature:
            InventoryFlowView(dependencies: dependencies, entityRouter: composition.entityRouter)
        default:
            unavailableExplanation
        }
    }

    /// Describes what the BFM said was unusable and lets the person retry.
    internal var unavailableExplanation: some View {
        ErrorStateView(
            message: RootCopy.nothingAvailable(surface.unavailable),
            retryTitle: RootCopy.retry
        ) {
            Task { await shell.reloadBootstrap() }
        }
        .frame(maxHeight: .infinity)
    }
}
