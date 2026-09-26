import AppCore
import DesignSystem
import SwiftUI

/// Where the item goes, as one row that opens the shared destination picker.
///
/// One row rather than a segmented control: an item is in exactly one place,
/// and the answers are rows of one list. The glyph and its colour are the
/// dashboard's, so an open container offered here is the same object it is
/// there. With no picker installed the row only states where the item goes.
internal struct InventoryFormDestinationRow: View {
    @Binding internal var draft: InventoryItemDraft
    @Environment(\.inventoryPlacementPicker) private var picker
    @State private var choosing = false

    internal var body: some View {
        if picker == nil {
            summary
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Where it goes, \(summaryText)")
        } else {
            Button {
                choosing = true
            } label: {
                HStack(spacing: PopsSpacing.sm) {
                    summary
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityHidden(true)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Where it goes, \(summaryText)")
            .sheet(isPresented: $choosing) { pickerSheet }
        }
    }

    private var summary: some View {
        HStack(spacing: PopsSpacing.sm) {
            InventorySymbol.destination(draft.placement).image
                .foregroundStyle(tone)
                .accessibilityHidden(true)
            Text(summaryText)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
        }
    }

    @ViewBuilder private var pickerSheet: some View {
        if let picker {
            picker.makeView(
                InventoryPlacementPickerRequest(
                    itemId: draft.id, itemName: draft.isNamed ? draft.trimmedName : "this item",
                    current: draft.placement,
                    choose: { choice in
                        draft.placement = choice.placement
                        draft.placementName = choice.name
                        choosing = false
                    },
                    cancel: { choosing = false }))
        }
    }

    private var summaryText: String {
        switch draft.placement {
        case .hand: "In hand"
        case .container: draft.placementName.map { "In \($0)" } ?? "In a container"
        case .location: draft.placementName ?? "In a location"
        }
    }

    /// An open container is drawn in the colour the dashboard gives one.
    private var tone: Color {
        if case .container = draft.placement { return .popsWarning }
        return .popsMutedForeground
    }
}

/// Identifiers somebody else assigned: one row per identifier the item
/// carries, then an empty row whose plus adds another.
internal struct InventoryFormIdentifierRows: View {
    @Binding internal var draft: InventoryItemDraft

    internal var body: some View {
        ForEach($draft.identifiers) { $identifier in
            InventoryFormIdentifierRow(identifier: $identifier)
        }
        .onDelete { draft.identifiers.remove(atOffsets: $0) }
        InventoryFormTextRow(
            "Serial / model", placeholder: "Optional", text: $draft.pendingIdentifier,
            monospaced: true
        ) {
            Button {
                draft.commitPendingIdentifier()
            } label: {
                InventorySymbol.add.image
            }
            .buttonStyle(.borderless)
            .disabled(draft.pendingIdentifier.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityLabel("Add another serial or model")
        }
    }
}

private struct InventoryFormIdentifierRow: View {
    @Binding var identifier: InventoryIdentifierDraft

    var body: some View {
        InventoryFormFocusableRow { focus in
            HStack {
                InventoryFormCompactMenu(
                    title: "Kind", options: kinds, labels: labels, selection: $identifier.kind)
                TextField("Serial or model", text: $identifier.value)
                    .focused(focus)
                    .font(identifier.value.isEmpty ? .popsBody : .popsMonospaced)
                    .multilineTextAlignment(.leading)
                    .lineLimit(1)
            }
        }
    }

    /// The known kinds, plus a stored kind this build does not know, so an
    /// edit never silently relabels it.
    private var kinds: [String] {
        let known = InventoryIdentifierDraft.Kind.allCases.map(\.rawValue)
        return known.contains(identifier.kind) ? known : known + [identifier.kind]
    }

    private var labels: [String: String] {
        Dictionary(
            uniqueKeysWithValues: InventoryIdentifierDraft.Kind.allCases.map {
                ($0.rawValue, $0.label)
            })
    }
}
