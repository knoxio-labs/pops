import DesignSystem
import SwiftUI

/// The final action, and what is standing in its way.
///
/// The record is created here and nowhere earlier, so the button says so
/// rather than saying Save: everything above it is already held, and pressing
/// this is what turns held into recorded.
internal struct InventoryCreateBar: View {
    internal let draft: InventoryDraft
    internal let title: String
    internal let isWorking: Bool

    internal init(draft: InventoryDraft, title: String = "Create item", isWorking: Bool = false) {
        self.draft = draft
        self.title = title
        self.isWorking = isWorking
    }

    internal var body: some View {
        PopsActionBar {
            if let issue = draft.issues.first {
                Text(issue.message)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            PopsButton(isWorking ? "Creating" : title, prominence: .prominent) {}
                .disabled(!draft.canCreate || isWorking)
        }
    }
}

/// Leaving with something entered, which always asks.
///
/// The photographs are the reason it asks even when little is typed: their
/// bytes are staged against this draft, and a Cancel that silently drops four
/// photographs of an object already back in its box is a loss nobody can
/// undo.
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

/// When the record starts existing.
internal enum InventoryCreateMoment: Equatable {
    /// Nothing exists until Create. Everything above it is staged.
    case atFinalAction
    /// The record exists from the first keystroke, and the rest of the form is
    /// already editing it.
    case onFirstKeystroke
}

/// The bar for a record that already exists, so there is nothing to press.
///
/// Says what has happened rather than offering an action, because a screen
/// that keeps a filled button after the work is done is one people press
/// twice.
internal struct InventoryLiveRecordBar: View {
    internal let draft: InventoryDraft

    internal var body: some View {
        PopsActionBar {
            Text("Recorded as you type. \(InventorySync.queued.label.lowercased()).")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            PopsButton("Done") {}
                .disabled(!draft.canCreate)
        }
    }
}

/// The draft a relaunch found.
///
/// Sits above the form rather than in a dialog, because a dialog on launch is
/// answered before it is read, and answering it wrongly throws away the work
/// it is about.
internal struct InventoryResumeNotice: View {
    internal let draft: InventoryDraft

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            PopsStatusHeader(
                tone: .information,
                title: "Picked up where you left off",
                message: "\(draft.name) was being entered when the app closed. Nothing was created."
            )
            HStack(spacing: PopsSpacing.sm) {
                PopsButton("Carry on", prominence: .prominent) {}
                PopsButton("Start again") {}
            }
        }
        .padding(PopsSpacing.lg)
    }
}

/// What the item will be, in the words every other Inventory screen uses.
///
/// The review step draws the row rather than a second summary layout, so the
/// last thing seen before the final action is the thing the catalogue will
/// show afterwards.
internal struct InventoryDraftPreview: View {
    internal let draft: InventoryDraft

    internal var body: some View {
        InventoryItemRow(item: previewItem)
    }

    private var previewItem: InventoryFoundationItem {
        InventoryFoundationItem(
            id: draft.internalID,
            name: draft.name.isEmpty ? "Unnamed" : draft.name,
            typeName: draft.typeName,
            code: draft.code.isLabelled ? draft.code.value : nil,
            quantity: draft.quantity,
            placement: draft.placement.placement ?? .inHand(previous: nil),
            sync: .saved)
    }
}
