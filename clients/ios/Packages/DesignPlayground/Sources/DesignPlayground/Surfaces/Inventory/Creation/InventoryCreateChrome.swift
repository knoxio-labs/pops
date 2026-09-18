import SwiftUI

/// Leaving with something entered, which asks only when there is something to
/// lose.
///
/// The photographs are the reason it asks at all: their bytes are staged
/// against this draft, and a Cancel that silently drops three photographs of
/// an object already back in its box is a loss nobody can undo.
internal struct InventoryCancelButton: View {
    internal let draft: InventoryDraft
    @State private var cancelling: Bool

    internal init(draft: InventoryDraft, presenting: Bool = false) {
        self.draft = draft
        _cancelling = State(initialValue: presenting)
    }

    internal var body: some View {
        Button("Cancel") {
            cancelling = draft.hasStagedWork
        }
        .confirmationDialog(
            "Discard this item?", isPresented: $cancelling, titleVisibility: .visible
        ) {
            Button("Keep the draft", role: .cancel) {}
            Button("Discard", role: .destructive) {}
        } message: {
            Text(discardMessage)
        }
    }

    private var discardMessage: String {
        draft.photos.isEmpty
            ? "Nothing has been created yet. What you typed is kept until you discard it."
            : "Nothing has been created yet. \(draft.photos.count) photos are held with it."
    }
}
