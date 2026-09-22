import AppCore
import SwiftUI

/// Resolves every route owned by the Purchases flow.
internal struct PurchasesDestinationView: View {
    internal let route: PurchasesScreenRoute
    internal let dependencies: AppDependencies

    @ViewBuilder internal var body: some View {
        switch route {
        case .archive(let scope):
            PurchasesArchiveScreen(scope: scope)
        case .detail(let id):
            PurchaseDetailScreen(id: id, dependencies: dependencies)
        }
    }
}
