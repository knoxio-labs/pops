import AppCore
import DesignSystem
import SwiftUI

/// One field the chosen type declares, drawn as the system control for its
/// value kind and labelled like every other row. Generic over the catalogue
/// descriptor: a type the server ships after this build renders without an
/// app release, as long as its value kinds are ones this build knows.
internal struct InventoryFormFieldRow: View {
    internal let field: InventoryFieldDefinition
    internal let entry: InventoryFieldEntry
    internal let units: [String]
    internal let set: (InventoryFieldEntry) -> Void

    internal var body: some View {
        switch entry {
        case .text(let text):
            InventoryFormTextRow(
                field.label, placeholder: "Not recorded",
                text: Binding(get: { text }, set: { set(.text($0)) }))
        case .link(let link):
            InventoryFormTextRow(
                field.label, placeholder: "Not recorded",
                text: Binding(get: { link }, set: { set(.link($0)) }))
        case .flag(let isOn):
            Toggle(field.label, isOn: Binding(get: { isOn }, set: { set(.flag($0)) }))
        case .choice(let chosen):
            InventoryFormChoiceRow(field: field, chosen: chosen) { set(.choice($0)) }
        case .measurement(let amount, let unit):
            InventoryFormMeasureRow(
                label: field.label, amount: amount, unit: unit, units: units
            ) { set(.measurement(amount: $0, unit: $1)) }
        case .range(let low, let high, let unit):
            InventoryFormRangeRow(
                label: field.label, low: low, high: high, unit: unit, units: units
            ) { set(.range(low: $0, high: $1, unit: $2)) }
        }
    }
}

/// A closed list, pushed rather than typed: the row shows the current value
/// and opens the type's declared values, searchable when there are many.
internal struct InventoryFormChoiceRow: View {
    internal let field: InventoryFieldDefinition
    internal let chosen: String?
    internal let choose: (String?) -> Void

    internal var body: some View {
        NavigationLink {
            InventoryFormChoiceList(field: field, chosen: chosen, choose: choose)
        } label: {
            LabeledContent(field.label) {
                Text(chosen ?? "Not recorded")
                    .foregroundStyle(
                        chosen == nil ? Color.popsMutedForeground : Color.popsForeground)
            }
        }
    }
}

/// The declared values of one choice field, with a check on the current one.
internal struct InventoryFormChoiceList: View {
    internal let field: InventoryFieldDefinition
    internal let chosen: String?
    internal let choose: (String?) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        List {
            if query.isEmpty {
                option("Not recorded", value: nil)
            }
            ForEach(matches, id: \.self) { value in
                option(value, value: value)
            }
        }
        .navigationTitle(field.label)
        .inventoryTitleDisplay(large: false)
        .modifier(
            InventoryFormChoiceSearch(
                isSearchable: InventoryFormChoices.isSearchable(field), query: $query))
    }

    private var matches: [String] {
        InventoryFormChoices.options(for: field, matching: query)
    }

    private func option(_ title: String, value: String?) -> some View {
        Button {
            choose(value)
            dismiss()
        } label: {
            HStack {
                Text(title)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if value == chosen {
                    Image(systemName: "checkmark")
                        .fontWeight(.semibold)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(.rect)
        }
        .accessibilityAddTraits(value == chosen ? .isSelected : [])
    }
}

/// A search field on the list only when it is long enough to need one.
private struct InventoryFormChoiceSearch: ViewModifier {
    let isSearchable: Bool
    @Binding var query: String

    func body(content: Content) -> some View {
        if isSearchable {
            content.searchable(text: $query)
        } else {
            content
        }
    }
}
