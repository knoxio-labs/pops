import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseOriginalValue: Hashable, Sendable {
    internal let label: String
    internal let original: String?
    internal let current: String?

    internal init(_ change: PurchaseFieldChange, lines: [PurchaseDetailLine]) {
        label = PurchaseDetailCopy.label(for: change, lines: lines)
        original = change.original
        current = change.current
    }

    internal var accessibilityLabel: String {
        switch (original, current) {
        case (.some(let original), .some(let current)):
            "\(label): was \(original), now \(current)"
        case (.some(let original), .none):
            "\(label): was \(original)"
        case (.none, .some(let current)):
            "\(label): now \(current)"
        case (.none, .none):
            label
        }
    }
}

internal struct PurchaseOriginalChangeRow: View {
    internal let value: PurchaseOriginalValue

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(value.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if let original = value.original {
                Text(original)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .strikethrough()
            }
            if let current = value.current {
                Text(current)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value.accessibilityLabel)
    }
}

internal struct PurchaseOriginalSheet: View {
    internal let edit: PurchaseEdit
    internal let lines: [PurchaseDetailLine]
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                ForEach(Array(edit.changes.enumerated()), id: \.offset) { _, change in
                    PurchaseOriginalChangeRow(
                        value: PurchaseOriginalValue(change, lines: lines))
                }
            }
            .navigationTitle("As read")
            .popsTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .tint(.popsPurchases)
    }
}
