import DesignSystem
import SwiftUI

/// The units one field can be written in.
///
/// Every unit of the same dimension, so a length can be given in millimetres
/// on one item and metres on the next. The unit belongs to the value, not to
/// the field: a catalogue that forces one is a catalogue people convert in
/// their heads and get wrong.
internal enum InventoryFormUnits {
    internal static func options(for symbol: String?) -> [String] {
        guard let symbol, let unit = InventoryUnit.named(symbol) else { return [] }
        return InventoryUnit.known.filter { $0.dimension == unit.dimension }.map(\.symbol)
    }
}

/// A unit beside the value it measures, as a menu when there is a choice and
/// as a label when the dimension has only one unit.
internal struct InventoryFormUnitPicker: View {
    internal let options: [String]
    @State private var unit: String

    internal init(options: [String], unit: String) {
        self.options = options
        _unit = State(initialValue: unit)
    }

    @ViewBuilder internal var body: some View {
        if options.count > 1 {
            InventoryFormCompactMenu(title: "Unit", options: options, selection: $unit)
        } else {
            Text(unit)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}

/// A choice drawn as its current value and a chevron, opening a menu.
///
/// A borderless menu with a text label rather than a menu-style picker, which
/// pads its button and makes the row taller than its neighbours.
internal struct InventoryFormCompactMenu: View {
    internal let title: String
    internal let options: [String]
    @Binding internal var selection: String

    internal var body: some View {
        Menu {
            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
        } label: {
            HStack(spacing: PopsSpacing.xs) {
                Text(selection)
                    .font(.popsBody)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.popsCaption.weight(.semibold))
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.borderless)
        .fixedSize()
        .accessibilityLabel("\(title), \(selection)")
    }
}

internal struct InventoryFormMeasureRow: View {
    internal let field: InventoryTemplateField
    @State private var amount: String

    internal init(field: InventoryTemplateField, value: InventoryPropertyValue?) {
        self.field = field
        _amount = State(initialValue: InventoryFormAmount.text(of: value))
    }

    internal var body: some View {
        LabeledContent(field.key) {
            HStack(spacing: PopsSpacing.sm) {
                TextField("Not recorded", text: $amount)
                    .font(.popsBody)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .playgroundDecimalKeyboard()
                InventoryFormUnitPicker(
                    options: InventoryFormUnits.options(for: field.unit), unit: field.unit ?? "")
            }
        }
    }
}

internal struct InventoryFormRangeRow: View {
    internal let field: InventoryTemplateField
    @State private var low: String
    @State private var high: String

    internal init(field: InventoryTemplateField, value: InventoryPropertyValue?) {
        self.field = field
        _low = State(initialValue: InventoryFormAmount.lowText(of: value))
        _high = State(initialValue: InventoryFormAmount.highText(of: value))
    }

    internal var body: some View {
        LabeledContent(field.key) {
            HStack(spacing: PopsSpacing.sm) {
                TextField("From", text: $low)
                    .font(.popsBody)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .playgroundDecimalKeyboard()
                TextField("To", text: $high)
                    .font(.popsBody)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .playgroundDecimalKeyboard()
                InventoryFormUnitPicker(
                    options: InventoryFormUnits.options(for: field.unit), unit: field.unit ?? "")
            }
        }
    }
}

/// A value's figures as a field holds them: text, because a half-typed number
/// is a string and rounding it while somebody is still typing is how a form
/// eats a decimal point.
internal enum InventoryFormAmount {
    internal static func text(of value: InventoryPropertyValue?) -> String {
        guard case .measure(let amount, _) = value else { return "" }
        return figure(amount)
    }

    internal static func lowText(of value: InventoryPropertyValue?) -> String {
        guard case .span(let low, _, _) = value else { return "" }
        return figure(low)
    }

    internal static func highText(of value: InventoryPropertyValue?) -> String {
        guard case .span(_, let high, _) = value else { return "" }
        return figure(high)
    }

    private static func figure(_ value: Double) -> String {
        value == value.rounded() ? String(format: "%.0f", value) : String(format: "%g", value)
    }
}
