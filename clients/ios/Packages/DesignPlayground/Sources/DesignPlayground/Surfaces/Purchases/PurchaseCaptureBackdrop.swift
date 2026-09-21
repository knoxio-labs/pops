import FeaturePurchases
import SwiftUI

/// What the capture sheets are presented over: the purchase history the app
/// ships, with the five fixture purchases in it, so a sheet's height and what
/// shows behind it are reviewed against the screen it really covers.
internal struct PurchaseCaptureBackdrop: View {
    internal var body: some View {
        PurchasesListView(
            dependencies: playgroundPurchasesDependencies(rows: PurchasesFixtures.all))
    }
}
