import DesignSystem
import SwiftUI

/// A figure with its unit beside it. Changing the unit relabels the figure
/// rather than converting it: what was typed is what is stored (POPS-4015).
internal struct InventoryFormMeasureRow: View {
    internal let label: String
    internal let amount: String
    internal let unit: String
    internal let units: [String]
    internal let set: (_ amount: String, _ unit: String) -> Void

    internal var body: some View {
        LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryFormFigureField(
                    placeholder: InventoryFormBlank.placeholder,
                    text: Binding(get: { amount }, set: { set($0, unit) }))
                InventoryFormUnitPicker(
                    options: units, unit: Binding(get: { unit }, set: { set(amount, $0) }))
            }
        }
    }
}

internal struct InventoryFormRangeRow: View {
    internal let label: String
    internal let low: String
    internal let high: String
    internal let unit: String
    internal let units: [String]
    internal let set: (_ low: String, _ high: String, _ unit: String) -> Void

    internal var body: some View {
        LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryFormFigureField(
                    placeholder: "From", text: Binding(get: { low }, set: { set($0, high, unit) }))
                InventoryFormFigureField(
                    placeholder: "To", text: Binding(get: { high }, set: { set(low, $0, unit) }))
                InventoryFormUnitPicker(
                    options: units, unit: Binding(get: { unit }, set: { set(low, high, $0) }))
            }
        }
    }
}

private struct InventoryFormFigureField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        TextField(placeholder, text: $text)
            .font(.popsBody)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .inventoryDecimalKeyboard()
    }
}

/// A unit beside the value it measures: a menu when the dimension has a
/// choice, a label when it has one unit.
internal struct InventoryFormUnitPicker: View {
    internal let options: [String]
    @Binding internal var unit: String

    @ViewBuilder internal var body: some View {
        let offered = options.contains(unit) || unit.isEmpty ? options : options + [unit]
        if offered.count > 1 {
            InventoryFormCompactMenu(title: "Unit", options: offered, selection: $unit)
        } else {
            Text(unit)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}

/// A choice drawn as its current value and a chevron, opening a menu. A
/// borderless menu with a text label rather than a menu-style picker, which
/// pads its button and makes the row taller than its neighbours.
internal struct InventoryFormCompactMenu: View {
    internal let title: String
    internal let options: [String]
    internal let labels: [String: String]
    @Binding internal var selection: String

    internal init(
        title: String, options: [String], labels: [String: String] = [:],
        selection: Binding<String>
    ) {
        self.title = title
        self.options = options
        self.labels = labels
        _selection = selection
    }

    internal var body: some View {
        Menu {
            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { Text(label(for: $0)).tag($0) }
            }
        } label: {
            HStack(spacing: PopsSpacing.xs) {
                Text(label(for: selection))
                    .font(.popsBody)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.popsCaption.weight(.semibold))
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.borderless)
        .fixedSize()
        .accessibilityLabel("\(title), \(label(for: selection))")
    }

    private func label(for option: String) -> String {
        labels[option] ?? option
    }
}
