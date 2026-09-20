import DesignSystem
import SwiftUI

/// One history line in full: where from, where to, the reason, the device,
/// and Undo in the bar while it is still undoable.
internal struct InventoryHistoryEventSheet: View {
    internal let entry: InventoryActivityEntry
    internal let onUndo: () -> Void
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                Section { InventoryHistoryLine(entry: entry, showsDisclosure: false) }
                Section {
                    if let from = entry.from { InventoryPropertyLine(key: "From", value: from) }
                    if let to = entry.to { InventoryPropertyLine(key: "To", value: to) }
                    if let reason = entry.reason {
                        InventoryPropertyLine(key: "Reason", value: reason.label)
                    }
                    if !entry.detail.isEmpty {
                        InventoryPropertyLine(key: "Note", value: entry.detail)
                    }
                    if let device = entry.device {
                        InventoryPropertyLine(key: "Device", value: device)
                    }
                }
            }
            .inventoryInsetGroupedList()
            .navigationTitle(entry.verb)
            .inventoryTitleDisplay(large: false)
            .toolbar {
                if entry.isUndoable {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            onUndo()
                            dismiss()
                        } label: {
                            Label {
                                Text("Undo")
                            } icon: {
                                InventorySymbol.restore.image
                            }
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(.popsInventory)
        .presentationDetents([.medium, .large])
    }
}

/// A history event as one line: its glyph, what happened, when.
internal struct InventoryHistoryLine: View {
    internal let entry: InventoryActivityEntry
    internal var showsDisclosure = true
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            entry.symbol.image
                .font(.popsHeadline)
                .foregroundStyle(tone)
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(entry.title)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if let record = entry.record {
                    Text(record)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(entry.when)
                .font(.popsCaption)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize()
            if showsDisclosure { InventoryRowChevron() }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private var tone: Color {
        entry.symbol == InventorySymbol.destroyed ? .popsDestructive : .popsMutedForeground
    }
}
