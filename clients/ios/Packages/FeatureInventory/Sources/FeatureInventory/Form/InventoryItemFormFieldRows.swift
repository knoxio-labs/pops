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
                field.label, placeholder: InventoryFormBlank.placeholder,
                text: Binding(get: { text }, set: { set(.text($0)) }))
        case .link(let link):
            InventoryFormTextRow(
                field.label, placeholder: InventoryFormBlank.placeholder,
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
/// and opens the field's declared values, searchable when there are many.
/// The same control for a protocol-1 choice and a protocol-2 enumeration, so
/// both follow the one approved presentation of a choice field.
internal struct InventoryFormChoiceRow: View {
    internal let label: String
    internal let fieldId: String
    /// The row's own handle for a driver, when the caller gives it one.
    internal let identifier: String?
    internal let options: [InventoryFormChoiceOption]
    internal let chosenId: String?
    /// What the row reads while `chosenId` is set, worked out by the caller:
    /// only it knows how a value its options no longer list should read.
    internal let chosenLabel: String?
    internal let choose: (String?) -> Void

    internal var body: some View {
        NavigationLink {
            InventoryFormChoiceList(
                title: label, fieldId: fieldId, options: options, chosenId: chosenId,
                choose: choose)
        } label: {
            LabeledContent(label) {
                Text(InventoryFormBlank.shown(chosenLabel))
                    .foregroundStyle(
                        chosenLabel == nil ? Color.popsMutedForeground : Color.popsForeground)
            }
        }
        .accessibilityIdentifier(identifier ?? "")
    }
}

extension InventoryFormChoiceRow {
    internal init(
        field: InventoryFieldDefinition, chosen: String?, choose: @escaping (String?) -> Void
    ) {
        self.init(
            label: field.label, fieldId: field.key, identifier: nil,
            options: InventoryFormChoices.options(for: field).map {
                InventoryFormChoiceOption(id: $0, label: $0)
            },
            chosenId: chosen, chosenLabel: chosen, choose: choose)
    }
}

/// The declared values of one choice field, with a check on the current one.
internal struct InventoryFormChoiceList: View {
    /// The row that clears the value: the one place an empty choice needs a word.
    internal static let clearTitle = "None"

    internal let title: String
    internal let fieldId: String
    internal let options: [InventoryFormChoiceOption]
    internal let chosenId: String?
    internal let choose: (String?) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        List {
            if query.isEmpty {
                option(Self.clearTitle, id: nil)
            }
            ForEach(InventoryFormChoices.matching(options, query: query)) { choice in
                option(choice.label, id: choice.id)
            }
        }
        .navigationTitle(title)
        .popsTitleDisplay(large: false)
        .modifier(
            InventoryFormChoiceSearch(
                isSearchable: InventoryFormChoices.isSearchable(options), query: $query))
    }

    private func option(_ label: String, id: String?) -> some View {
        Button {
            choose(id)
            dismiss()
        } label: {
            HStack {
                Text(label)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if id == chosenId {
                    Image(systemName: "checkmark")
                        .fontWeight(.semibold)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(.rect)
        }
        .accessibilityAddTraits(id == chosenId ? .isSelected : [])
        .accessibilityIdentifier(
            id.map { InventoryAccessibility.choiceOption(fieldId: fieldId, optionId: $0) }
                ?? InventoryAccessibility.choiceClear(fieldId: fieldId))
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
