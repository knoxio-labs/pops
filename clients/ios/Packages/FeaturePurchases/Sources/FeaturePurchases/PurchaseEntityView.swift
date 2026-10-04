import AppCore
import SwiftUI

/// A purchase opened on its own navigation stack over the current screen.
public struct PurchaseEntityView: View {
    @Environment(\.dismiss) private var dismiss
    private let entity: PurchaseEntity
    private let dependencies: AppDependencies

    /// Creates the detail screen from the routed purchase id.
    public init(entity: PurchaseEntity, dependencies: AppDependencies) {
        self.entity = entity
        self.dependencies = dependencies
    }

    public var body: some View {
        NavigationStack {
            PurchaseDetailScreen(id: entity.purchaseId, dependencies: dependencies)
                .navigationDestination(for: PurchasesScreenRoute.self) { route in
                    PurchasesDestinationView(route: route, dependencies: dependencies)
                }
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            dismiss()
                        }
                    }
                }
        }
    }
}
