import AppCore
import SwiftUI

/// A transaction opened on its own navigation stack over the current screen.
public struct TransactionEntityView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: TransactionDetailViewModel

    /// Creates the detail model from the routed transaction id.
    public init(entity: TransactionEntity, dependencies: AppDependencies) {
        _model = State(
            wrappedValue: TransactionDetailViewModel(
                id: entity.transactionId,
                seed: nil,
                dependencies: dependencies
            )
        )
    }

    public var body: some View {
        NavigationStack {
            TransactionDetailView(model: model)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(TransactionsCopy.done) {
                            dismiss()
                        }
                    }
                }
        }
    }
}
