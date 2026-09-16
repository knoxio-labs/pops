import DesignSystem
import SwiftUI

/// The two values that cannot both be true, drawn the way the style says.
///
/// Every treatment shows both values and names where each came from. What
/// differs is what the reader is being asked to do: compare, read, pick per
/// field, or write the answer themselves.
internal struct InventoryConflictComparison: View {
    internal let conflict: InventoryConflict
    @Environment(\.inventorySyncStyle) private var style

    @ViewBuilder internal var body: some View {
        if conflict.fields.isEmpty {
            InventoryConflictStatement(conflict: conflict)
        } else {
            switch style.conflictTreatment {
            case .sideBySide: InventorySideBySideComparison(fields: conflict.fields)
            case .stacked: InventoryStackedComparison(fields: conflict.fields)
            case .fieldMerge: InventoryFieldMerge(fields: conflict.fields)
            case .editFinal: InventoryFinalValueEditor(fields: conflict.fields)
            }
        }
    }
}

/// What a repair with nothing to compare says instead.
///
/// An expired session and a full disk are repairs with one side, and a screen
/// that drew an empty comparison for them would be inventing a disagreement
/// to fill a layout.
internal struct InventoryConflictStatement: View {
    internal let conflict: InventoryConflict

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Image(systemName: symbol.system)
                .font(.popsTitle)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            Text("Nothing on this phone has been changed or lost.")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var symbol: InventorySymbol {
        switch conflict.kind {
        case .expiredSession: .signIn
        case .storageFull: .storage
        case .unsupportedContract: .appUpdate
        default: .queued
        }
    }
}

/// Both values in one row, under the field they disagree about.
internal struct InventorySideBySideComparison: View {
    internal let fields: [InventoryDisagreement]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(fields, id: \.field) { field in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(field.field)
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        InventoryConflictSide(
                            source: "On this phone", value: field.onThisPhone, isLocal: true)
                        InventoryConflictSide(
                            source: field.elsewhereName, value: field.elsewhere, isLocal: false)
                    }
                }
            }
        }
    }
}

/// One side of a comparison: where it came from, and what it says.
internal struct InventoryConflictSide: View {
    internal let source: String
    internal let value: String
    internal let isLocal: Bool

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(source)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(value)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PopsSpacing.sm)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsInventory.opacity(isLocal ? 0.12 : 0.0))
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The same two values one under the other, full width.
///
/// Costs height and buys line length: a place name that is four words long
/// does not fit half a 393pt phone.
internal struct InventoryStackedComparison: View {
    internal let fields: [InventoryDisagreement]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(fields, id: \.field) { field in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(field.field)
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    InventoryConflictSide(
                        source: "On this phone", value: field.onThisPhone, isLocal: true)
                    InventoryConflictSide(
                        source: field.elsewhereName, value: field.elsewhere, isLocal: false)
                }
            }
        }
    }
}

/// A choice per field rather than one choice for the record.
///
/// The only treatment that can end with a value neither side had in full, and
/// the only one that asks a person to understand that a record has fields.
internal struct InventoryFieldMerge: View {
    internal let fields: [InventoryDisagreement]
    @State private var chosen: [String: Bool] = [:]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(fields, id: \.field) { field in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(field.field)
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    Picker(field.field, selection: binding(for: field)) {
                        Text(field.onThisPhone).tag(true)
                        Text(field.elsewhere).tag(false)
                    }
                    .pickerStyle(.segmented)
                    Text(
                        chosen[field.field] == false
                            ? "From \(field.elsewhereName)" : "From this phone"
                    )
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func binding(for field: InventoryDisagreement) -> Binding<Bool> {
        Binding(
            get: { chosen[field.field] ?? true },
            set: { chosen[field.field] = $0 })
    }
}

/// Neither value, unless the person types it again.
///
/// The most honest about "the truth is in the room", and the most expensive:
/// it makes every repair a small piece of data entry.
internal struct InventoryFinalValueEditor: View {
    internal let fields: [InventoryDisagreement]
    @State private var values: [String: String] = [:]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(fields, id: \.field) { field in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(field.field)
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    PopsTextField(
                        placeholder: field.onThisPhone,
                        text: Binding(
                            get: { values[field.field] ?? field.onThisPhone },
                            set: { values[field.field] = $0 }))
                    Text(
                        "This phone said \(field.onThisPhone). "
                            + "\(field.elsewhereName) said \(field.elsewhere)."
                    )
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }
}
