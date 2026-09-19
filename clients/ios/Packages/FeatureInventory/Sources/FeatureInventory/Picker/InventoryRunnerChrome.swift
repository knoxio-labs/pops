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

internal struct InventoryRunnerChrome: ViewModifier {
    @Bindable var runner: InventoryCommandRunner

    func body(content: Content) -> some View {
        content
            .inventoryUndoCapsule($runner.undoOffer) { offer in
                Task { await runner.undo(offer) }
            }
            .alert(
                InventoryCopy.failureTitle,
                isPresented: presented(Self.genericFailure(runner.failure)),
                presenting: Self.genericFailure(runner.failure)
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(InventoryCopy.message(for: failure))
            }
            .inventoryStorageFullAlert(isPresented: presented(Self.storageFullFailure(runner.failure)))
    }

    /// `failure`, unless it is a storage-full write — that one never shows
    /// this one-line alert, because it has its own approved alert below,
    /// shared with the one the Sync page shows for the same reason. A pure
    /// function of `runner.failure` rather than inline, so a test can drive
    /// every `InventoryWriteFailure` case without a running runner.
    nonisolated internal static func genericFailure(
        _ failure: InventoryWriteFailure?
    ) -> InventoryWriteFailure? {
        guard let failure, failure != .storageFull else { return nil }
        return failure
    }

    /// The other half of the split `genericFailure(_:)` makes: `failure`
    /// only when it is a storage-full write.
    nonisolated internal static func storageFullFailure(
        _ failure: InventoryWriteFailure?
    ) -> InventoryWriteFailure? {
        failure == .storageFull ? failure : nil
    }

    private func presented(_ failure: InventoryWriteFailure?) -> Binding<Bool> {
        Binding(
            get: { failure != nil },
            set: { if !$0 { runner.failure = nil } }
        )
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
