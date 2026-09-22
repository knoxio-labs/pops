import AppCore
import SwiftUI

/// The Purchases tab, including the navigation state for every screen it opens.
public struct PurchasesFlowView: View {
    @State private var path: [PurchasesScreenRoute] = []
    private let dependencies: AppDependencies

    /// Creates the Purchases flow with the repositories bound by the app composition root.
    public init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }

    public var body: some View {
        NavigationStack(path: $path) {
            PurchasesHomeScreen(dependencies: dependencies)
                .navigationDestination(for: PurchasesScreenRoute.self) { route in
                    PurchasesDestinationView(route: route, dependencies: dependencies)
                }
        }
    }
}
