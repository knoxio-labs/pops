import DesignSystem
import SwiftUI

/// Which small sheet a grouped record's More menu opened.
internal enum InventoryLifecycleSheet: String, Identifiable {
    case split
    case changeQuantity

    internal var id: String { rawValue }
}

/// Split: how many leave this record for one of their own. The two counts
/// move together, so the one stepper cannot leave either side empty.
internal struct InventorySplitSheet: View {
    internal let record: InventoryDetailRecord
    internal let onSplit: (Int) -> Void
    @State private var count: Int
    @Environment(\.dismiss) private var dismiss

    internal init(record: InventoryDetailRecord, onSplit: @escaping (Int) -> Void) {
        self.record = record
        self.onSplit = onSplit
        _count = State(initialValue: max(1, record.quantity.count / 2))
    }

    internal var body: some View {
        InventoryQuantitySheetFrame(
            title: "Split", commit: "Split", onCommit: split
        ) {
            Section {
                Stepper(value: $count, in: 1...max(1, record.quantity.count - 1)) {
                    InventoryQuantityLine(label: "New record", count: count)
                }
                InventoryQuantityLine(label: "Stays here", count: record.quantity.count - count)
            } header: {
                Text(record.name)
            }
        }
    }

    private func split() {
        onSplit(count)
        dismiss()
    }
}

/// Change quantity: the record's own count, renumbered in place.
internal struct InventoryChangeQuantitySheet: View {
    /// The server's ceiling for one record's count.
    internal static let ceiling = 9_999

    internal let record: InventoryDetailRecord
    internal let onChange: (Int) -> Void
    @State private var count: Int
    @Environment(\.dismiss) private var dismiss

    internal init(record: InventoryDetailRecord, onChange: @escaping (Int) -> Void) {
        self.record = record
        self.onChange = onChange
        _count = State(initialValue: record.quantity.count)
    }

    internal var body: some View {
        InventoryQuantitySheetFrame(
            title: "Quantity", commit: "Save", canCommit: count != record.quantity.count,
            onCommit: save
        ) {
            Section {
                Stepper(value: $count, in: 1...Self.ceiling) {
                    InventoryQuantityLine(label: "Quantity", count: count)
                }
            } header: {
                Text(record.name)
            }
        }
    }

    private func save() {
        onChange(count)
        dismiss()
    }
}

/// The frame both quantity sheets share: a short inset list, Cancel and the
/// commit in the navigation bar, and a medium detent.
internal struct InventoryQuantitySheetFrame<Content: View>: View {
    internal let title: String
    internal let commit: String
    internal var canCommit = true
    internal let onCommit: () -> Void
    @ViewBuilder internal let content: () -> Content
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List { content() }
                .inventoryInsetGroupedList()
                .navigationTitle(title)
                .popsTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(commit, action: onCommit)
                            .disabled(!canCommit)
                    }
                }
        }
        .tint(.popsInventory)
        .presentationDetents([.medium])
    }
}

private struct InventoryQuantityLine: View {
    let label: String
    let count: Int

    var body: some View {
        HStack {
            Text(label)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            Text("\(count)")
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .contentTransition(.numericText(value: Double(count)))
        }
    }
}
