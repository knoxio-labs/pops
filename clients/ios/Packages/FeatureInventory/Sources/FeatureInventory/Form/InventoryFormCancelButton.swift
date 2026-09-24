import SwiftUI

/// Leaving asks only when there is something to lose, and says nothing when
/// there is not.
internal struct InventoryFormCancelButton: View {
    internal let mode: InventoryItemFormMode
    internal let hasStagedWork: Bool
    internal let leave: () -> Void
    @State private var confirming = false

    internal var body: some View {
        Button("Cancel") {
            if hasStagedWork { confirming = true } else { leave() }
        }
        .confirmationDialog(title, isPresented: $confirming, titleVisibility: .visible) {
            Button(keepTitle, role: .cancel) {}
            Button("Discard", role: .destructive, action: leave)
        } message: {
            Text(message)
        }
    }

    private var title: String {
        mode == .create ? "Discard this item?" : "Discard your changes?"
    }

    private var keepTitle: String {
        mode == .create ? "Keep the draft" : "Keep editing"
    }

    private var message: String {
        mode == .create
            ? "Nothing has been created yet. What you typed is kept until you discard it."
            : "The item stays as it was."
    }
}
