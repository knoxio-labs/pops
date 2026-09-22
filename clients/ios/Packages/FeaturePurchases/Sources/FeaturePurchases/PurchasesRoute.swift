import AppCore
import SwiftUI

/// A purchase destination another feature can open without importing feature-local models.
public enum PurchasesRoute: Hashable, Sendable {
    case detail(String)
}

/// Every screen the Purchases stack can push from its own home screen.
internal enum PurchasesScreenRoute: Hashable, Sendable {
    case archive(PurchasesArchiveScope)
    case detail(Purchase.ID)
}

/// The subset of stored purchases shown by the archive screen.
internal enum PurchasesArchiveScope: Hashable, Sendable, CaseIterable {
    case all
    case unmatched
}

extension View {
    /// Registers destinations that other features can open by using a public purchase route.
    public func purchasesDestinations(dependencies: AppDependencies) -> some View {
        navigationDestination(for: PurchasesRoute.self) { route in
            switch route {
            case .detail(let id):
                PurchaseDetailScreen(id: id, dependencies: dependencies)
            }
        }
    }
}
