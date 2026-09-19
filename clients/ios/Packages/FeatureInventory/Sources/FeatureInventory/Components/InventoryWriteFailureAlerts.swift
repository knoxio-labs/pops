import SwiftUI

extension View {
    /// The one presentation of a write that did not land, for every screen
    /// that keeps an `InventoryWriteFailure`: a storage-full write gets the
    /// approved Storage full alert, the same one the Sync page shows, and
    /// every other failure gets the one-line alert. Dismissing either clears
    /// `failure`.
    internal func inventoryWriteFailureAlerts(
        _ failure: Binding<InventoryWriteFailure?>
    ) -> some View {
        modifier(InventoryWriteFailureAlerts(failure: failure))
    }
}

internal struct InventoryWriteFailureAlerts: ViewModifier {
    @Binding var failure: InventoryWriteFailure?

    func body(content: Content) -> some View {
        content
            .alert(
                InventoryCopy.failureTitle,
                isPresented: presented(Self.genericFailure(failure)),
                presenting: Self.genericFailure(failure)
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(InventoryCopy.message(for: failure))
            }
            .inventoryStorageFullAlert(isPresented: presented(Self.storageFullFailure(failure)))
    }

    /// `failure`, unless it is a storage-full write, which has its own
    /// alert. A pure function rather than inline, so a test can drive every
    /// `InventoryWriteFailure` case without mounting a view.
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

    private func presented(_ shown: InventoryWriteFailure?) -> Binding<Bool> {
        Binding(
            get: { shown != nil },
            set: { if !$0 { failure = nil } }
        )
    }
}
