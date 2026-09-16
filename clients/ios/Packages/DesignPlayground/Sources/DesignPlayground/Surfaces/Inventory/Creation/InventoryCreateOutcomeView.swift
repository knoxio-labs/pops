import DesignSystem
import SwiftUI

/// What the final action left behind.
///
/// The record exists from here on, so the screen shows the row the catalogue
/// will show and puts the correction next to it: the minute after creating
/// something is when a person still remembers what they got wrong, and
/// sending them to find it again is how a wrong name survives a move.
internal struct InventoryCreateOutcomeView: View {
    internal let draft: InventoryDraft
    internal let outcome: InventoryCreateOutcome

    internal var body: some View {
        List {
            Section {
                InventoryDraftPreview(draft: draft)
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: InventorySymbol.synced.system)
                        .accessibilityHidden(true)
                    Text(outcome.sync.label)
                }
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            } header: {
                Text(outcome.headline)
            } footer: {
                if let message = outcome.message { Text(message) }
            }
            if let message = draft.photos.progress.message {
                Section {
                    InventoryPhotoStrip(photos: draft.photos)
                } header: {
                    Text("Photos")
                } footer: {
                    Text(message)
                }
            }
            resolution
            Section {
                Button {
                } label: {
                    Label("Edit it", systemImage: InventorySymbol.edit.system)
                }
                Button {
                } label: {
                    Label("Add another here", systemImage: InventorySymbol.add.system)
                }
                Button {
                } label: {
                    Label("Copy it", systemImage: InventorySymbol.duplicate.system)
                }
            }
            .tint(.popsAccent)
        }
        .playgroundInsetGroupedList()
        .navigationTitle(draft.name)
        .playgroundTitleDisplay(large: false)
    }

    /// The one choice a disagreement needs. Absent when there is nothing to
    /// choose, which is the ordinary case.
    @ViewBuilder private var resolution: some View {
        switch outcome {
        case .created:
            EmptyView()
        case .validationChanged(let field, let serverValue):
            Section {
                Button("Keep mine") {}
                Button("Take \(serverValue)") {}
            } header: {
                Text("\(field) differs")
            }
            .tint(.popsAccent)
        case .repairRequired:
            Section {
                InventoryRepairRow(
                    item: repairSubject,
                    problem: "The code was taken while this was queued.",
                    resolution: "Pick another code")
            }
        }
    }

    private var repairSubject: InventoryFoundationItem {
        InventoryFoundationItem(
            id: draft.internalID,
            name: draft.name,
            typeName: draft.typeName,
            code: draft.code.isLabelled ? draft.code.value : nil,
            quantity: draft.quantity,
            placement: draft.placement.placement ?? .inHand(previous: nil),
            sync: .needsAttention)
    }
}
