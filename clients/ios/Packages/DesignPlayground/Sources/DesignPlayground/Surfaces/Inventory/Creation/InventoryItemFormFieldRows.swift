import DesignSystem
import SwiftUI

/// The values a choice field accepts when its type does not spell them out.
///
/// Code-defined like the types themselves, so two people recording the same
/// connector write the same word.
internal enum InventoryFormChoices {
    internal static let connectors = [
        "USB-A", "USB-C", "Lightning", "Micro-USB", "HDMI", "DisplayPort", "3.5 mm",
        "Barrel", "IEC C13",
    ]

    internal static func options(for field: InventoryTemplateField) -> [String] {
        if let declared = field.choices { return declared }
        switch InventoryPropertySchema.normalized(field.key) {
        case "end a", "end b": return connectors
        case "protocol": return ["Zigbee", "Matter", "Wi-Fi", "Bluetooth", "None"]
        case "plug": return ["Type I", "Type G", "Type C", "Type A"]
        case "use": return ["Gaffer", "Masking", "Duct", "Packing", "Electrical"]
        default: return []
        }
    }

    /// The tag a choice field carries when nothing has been picked. A real
    /// value rather than an optional binding, so the navigation picker has
    /// something to select.
    internal static let unset = ""
}

/// One field the chosen type declares, drawn as the system control for the
/// kind of value it takes and labelled the way every other form row is.
internal struct InventoryFormFieldRow: View {
    internal let field: InventoryTemplateField
    internal let value: InventoryPropertyValue?

    internal var body: some View {
        switch field.kindLabel {
        case "Choice":
            InventoryFormChoiceRow(field: field, value: value?.display ?? "")
        case "Yes or no":
            InventoryFormFlagRow(field: field, value: isOn)
        case "Measurement":
            InventoryFormMeasureRow(field: field, value: value)
        case "Range":
            InventoryFormRangeRow(field: field, value: value)
        default:
            InventoryFormFieldTextRow(field: field, value: text)
        }
    }

    private var isOn: Bool {
        guard case .flag(let flag) = value else { return false }
        return flag
    }

    private var text: String {
        guard case .text(let text) = value else { return "" }
        return text
    }
}

/// A closed list, pushed rather than typed. The navigation picker is the
/// platform's own answer to a list too long for a menu, and it brings the
/// search and the check mark with it.
internal struct InventoryFormChoiceRow: View {
    internal let field: InventoryTemplateField
    @State private var chosen: String

    internal init(field: InventoryTemplateField, value: String) {
        self.field = field
        _chosen = State(initialValue: value)
    }

    internal var body: some View {
        Picker(field.key, selection: $chosen) {
            Text("Not recorded").tag(InventoryFormChoices.unset)
            ForEach(InventoryFormChoices.options(for: field), id: \.self) { Text($0).tag($0) }
        }
        .playgroundPushedPicker()
    }
}

internal struct InventoryFormFlagRow: View {
    internal let field: InventoryTemplateField
    @State private var isOn: Bool

    internal init(field: InventoryTemplateField, value: Bool) {
        self.field = field
        _isOn = State(initialValue: value)
    }

    internal var body: some View {
        Toggle(field.key, isOn: $isOn)
    }
}

internal struct InventoryFormFieldTextRow: View {
    internal let field: InventoryTemplateField
    @State private var text: String

    internal init(field: InventoryTemplateField, value: String) {
        self.field = field
        _text = State(initialValue: value)
    }

    internal var body: some View {
        InventoryFormTextRow(field.key, placeholder: "Not recorded", text: $text)
    }
}
