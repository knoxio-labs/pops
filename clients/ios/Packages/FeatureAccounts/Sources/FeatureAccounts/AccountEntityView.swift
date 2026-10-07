import AppCore
import SwiftUI

/// An account opened on its own navigation stack over the current screen.
public struct AccountEntityView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: AccountDetailViewModel

    /// Creates the detail model from the routed account id.
    public init(entity: AccountEntity, dependencies: AppDependencies) {
        _model = State(
            wrappedValue: AccountDetailViewModel(
                id: entity.accountId,
                seed: nil,
                dependencies: dependencies
            )
        )
    }

    public var body: some View {
        NavigationStack {
            AccountDetailView(model: model)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(AccountsCopy.done) {
                            dismiss()
                        }
                    }
                }
        }
    }
}
