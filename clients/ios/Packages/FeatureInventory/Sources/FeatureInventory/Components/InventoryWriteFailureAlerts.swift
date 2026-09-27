import AppCore
import SwiftUI

extension View {
    internal func inventoryScanFailureAlerts(_ failure: Binding<PopsError?>) -> some View {
        modifier(InventoryScanFailureAlerts(failure: failure))
    }

    /// Routes a failed Inventory write to the process-wide presenter.
    internal func inventoryWriteFailureAlerts(
        _ failure: Binding<InventoryWriteFailure?>
    ) -> some View {
        modifier(InventoryWriteFailureAlerts(failure: failure))
    }
}

private struct InventoryScanFailureAlerts: ViewModifier {
    @Binding var failure: PopsError?
    @Environment(\.errorPresenter) private var errorPresenter

    func body(content: Content) -> some View {
        content.onChange(of: failure) { _, failure in
            guard let failure else { return }
            errorPresenter.present(failure, operation: "Scan item", context: .foreground)
            self.failure = nil
        }
    }
}

internal struct InventoryWriteFailureAlerts: ViewModifier {
    @Binding var failure: InventoryWriteFailure?
    @Environment(\.errorPresenter) private var errorPresenter

    func body(content: Content) -> some View {
        content
            .onChange(of: failure) { _, failure in
                guard let failure else { return }
                errorPresenter.present(
                    failure.popsError,
                    operation: "Update inventory",
                    context: .foreground)
                self.failure = nil
            }
    }
}

extension InventoryWriteFailure {
    internal var popsError: PopsError {
        let message = InventoryCopy.message(for: self)
        switch self {
        case .repository(let error):
            return PopsError(repositoryError: error, fallbackMessage: message)
        case .command(let error):
            return PopsError(
                code: "ios.inventory.command_\(error.presentationCode)",
                message: message,
                retryable: false,
                kind: .client)
        case .storageFull:
            return PopsError(
                code: "ios.storage.full",
                message: message,
                retryable: false,
                kind: .client)
        }
    }
}

extension InventoryCommandError {
    fileprivate var presentationCode: String {
        switch self {
        case .fieldConflict: "field_conflict"
        case .codeCollision: "code_collision"
        case .deletedElsewhere: "deleted_elsewhere"
        case .rejected: "rejected"
        case .nothingToUndo: "nothing_to_undo"
        case .repairNotFound: "repair_not_found"
        }
    }
}
