import AppCore
import SwiftUI

/// The purchase-detail destination while detail loading is introduced separately.
internal struct PurchaseDetailScreen: View {
    internal let id: Purchase.ID
    internal let dependencies: AppDependencies

    internal var body: some View {
        ContentUnavailableView("Purchase details unavailable", systemImage: "cart")
            .navigationTitle("Purchase")
    }
}
