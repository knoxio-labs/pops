import DesignSystem
import SwiftUI

extension View {
    /// What every screen that writes through an `InventoryCommandRunner`
    /// shows: the Undo capsule for the change it just made, and the one-line
    /// alert when a write did not land.
    internal func inventoryRunnerChrome(_ runner: InventoryCommandRunner) -> some View {
        modifier(InventoryRunnerChrome(runner: runner))
    }
}

private struct InventoryRunnerChrome: ViewModifier {
    @Bindable var runner: InventoryCommandRunner

    func body(content: Content) -> some View {
        content
            .inventoryUndoCapsule($runner.undoOffer) { offer in
                Task { await runner.undo(offer) }
            }
            .alert(
                InventoryCopy.failureTitle,
                isPresented: Binding(
                    get: { runner.failure != nil }, set: { if !$0 { runner.failure = nil } }),
                presenting: runner.failure
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(InventoryCopy.message(for: failure))
            }
    }
}

/// The one line a screen shows when its query ended without answering, with
/// the way to ask again.
internal struct InventoryUnavailableView: View {
    internal let retry: () -> Void

    internal var body: some View {
        ErrorStateView(message: InventoryCopy.unavailable, retry: retry)
    }
}
