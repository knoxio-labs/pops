import AppCore
import SwiftUI

/// The root of the Purchases flow, hosting the current saved-purchase list.
internal struct PurchasesHomeScreen: View {
    internal let dependencies: AppDependencies

    internal var body: some View {
        PurchasesListView(dependencies: dependencies)
            .navigationTitle(FeaturePurchases.displayName)
    }
}
