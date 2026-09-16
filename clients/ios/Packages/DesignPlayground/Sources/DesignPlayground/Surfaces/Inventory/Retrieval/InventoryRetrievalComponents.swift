import DesignSystem
import SwiftUI

/// The full list's row: an item row plus what the list, and not the compact
/// dashboard section, has room for: the previous-placement note and a move
/// button beside put back.
///
/// Deliberately not ``InventoryInHandRow``: that row is the dashboard
/// section's, sized for three items among other sections, and adding a
/// second button and a caption to it would make the section it was built for
/// too tall to stay compact.
internal struct InventoryFullInHandRow: View {
    internal let retrieval: InventoryRetrievalItem
    internal let onPutBack: () -> Void
    internal let onMove: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryItemRow(item: retrieval.item)
            if let note = retrieval.statusNote {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(noteTone)
                    .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            }
            if InventoryRetrieval.canMoveWhole(retrieval.item) {
                HStack(spacing: PopsSpacing.sm) {
                    if InventoryRetrieval.canPutBack(retrieval) {
                        Button("Put back", action: onPutBack)
                            .font(.popsSubheadline.weight(.semibold))
                            .playgroundGlassButton()
                            .tint(.popsInventory)
                    }
                    Button("Move…", action: onMove)
                        .font(.popsSubheadline.weight(.semibold))
                        .playgroundGlassButton()
                }
                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            } else {
                InventoryPartialQuantityNotice(item: retrieval.item)
                    .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var noteTone: Color {
        switch retrieval.previousStatus {
        case .current: .popsMutedForeground
        case .stale: .popsWarning
        case .deleted: .popsDestructive
        }
    }
}

/// Asked before a pick-up actually happens, for the item types a style
/// decides need one. See ``InventoryRetrievalStyle/PickupGrammar``: direct
/// move never shows this, because there is no separate pick-up step to
/// confirm.
internal struct InventoryPickUpConfirmationCard: View {
    internal let item: InventoryFoundationItem
    internal let onConfirm: () -> Void
    internal let onCancel: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            InventoryItemRow(item: item)
            Text("Picking it up remembers where it came from, so Put back is one tap.")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
            HStack(spacing: PopsSpacing.sm) {
                Button("Cancel", role: .cancel, action: onCancel)
                    .buttonStyle(.bordered)
                Button("Pick up", action: onConfirm)
                    .buttonStyle(.borderedProminent)
                    .tint(.popsInventory)
            }
        }
        .padding(PopsSpacing.lg)
    }
}

/// What put back leaves behind: confirmation that it worked and where it
/// landed, which matters most for the case a reviewer cannot see for
/// themselves: a closed container that just silently reopened.
internal struct InventoryPutBackSuccessCard: View {
    internal let item: InventoryFoundationItem
    internal let destination: String
    internal let reopenedContainer: Bool

    internal var body: some View {
        PopsStatusHeader(
            tone: .success,
            title: "Put back",
            message: "\(item.name) is back in \(destination).",
            caption: reopenedContainer ? "\(destination) was closed. It has been reopened." : nil
        )
    }
}

/// A move that has not left the phone yet, offline, or simply slower than
/// the tap that started it. Distinct from ``InventorySyncMarker`` because a
/// move in progress is the one thing on this screen that is happening right
/// now, not a fact about a row sitting still.
internal struct InventoryMoveProgressNotice: View {
    internal let item: InventoryFoundationItem
    internal let destination: String

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            ProgressView()
                .tint(.popsInventory)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("Moving \(item.name) to \(destination)")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text("Queued on this phone. Sends when it can reach the server.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(PopsSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }
}

/// A completed move, undoable in one tap. Its own small surface rather than a
/// fixed row, so the undo state shows what it actually looks like after the
/// row disappears rather than describing it.
internal struct InventoryMovementUndoDemo: View {
    @State private var undone = false

    internal var body: some View {
        List {
            Section("Recent work") {
                if undone {
                    Text("Cordless drill move undone. It is back in Garage tools.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                } else {
                    InventoryMovementHistoryRow(
                        subject: InventoryRetrievalFixtures.undoableMove.subject,
                        from: InventoryRetrievalFixtures.undoableMove.from,
                        to: InventoryRetrievalFixtures.undoableMove.to,
                        when: InventoryRetrievalFixtures.undoableMove.when,
                        onUndo: { undone = true }
                    )
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// Retrieval moves a whole group or nothing (see
/// ``InventoryRetrieval/canMoveWhole``). This is what a reader sees when
/// they reach for "some of these" from the in-hand list instead of from
/// Split.
internal struct InventoryPartialQuantityNotice: View {
    internal let item: InventoryFoundationItem

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Label("Moving some of these isn't a move", systemImage: InventorySymbol.split.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text(
                "All \(item.quantity.count) will go together. To take part of the group, "
                    + "split it first from \(item.name)'s actions."
            )
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
        }
        .padding(PopsSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .fill(Color.popsWarning.opacity(0.12))
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .stroke(Color.popsWarning, lineWidth: PopsBorder.hairline)
        }
    }
}
