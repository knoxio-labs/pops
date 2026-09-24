import AppCore
import DesignSystem
import SwiftUI

/// One scalar editor for a field's primitive kind, chosen the same way
/// whether it is writing a stored field's entry or composing a computed
/// field's override: an override is always the one value the expression
/// would otherwise have produced, never an array, regardless of the field's
/// cardinality.
internal struct InventoryProtocol2ValueEditor: View {
    let field: InventoryCatalogueField
    let entry: InventoryProtocol2DraftEntry
    let label: String
    let referenceTargets: [InventoryProtocol2ReferenceTarget]
    let setText: (String) -> Void
    let setValue: (InventoryPrimitiveValue?) -> Void
    let setReferenceKind: (InventoryReferenceTargetKind) -> Void

    @ViewBuilder var body: some View {
        switch field.kind {
        case .boolean:
            Picker(label, selection: scalarSelection) {
                Text("Not recorded").tag("")
                Text("Yes").tag("true")
                Text("No").tag("false")
            }
            .pickerStyle(.menu)
        case .enumeration:
            Picker(label, selection: enumSelection) {
                Text("Not recorded").tag("")
                ForEach(enumOptions) { option in
                    Text(option.archivedAt == nil ? option.label : "\(option.label) (Retired)")
                        .tag(option.id)
                }
            }
            .pickerStyle(.menu)
        case .reference:
            referenceEditor
        case .longText:
            longTextEditor
        case .measurement:
            measurementEditor
        default:
            InventoryFormTextRow(
                label, placeholder: field.help ?? "Not recorded", text: textBinding,
                identifier: InventoryAccessibility.protocol2Field(id: field.id))
        }
        if let issue = entry.issue {
            Text(issue)
                .font(.popsCaption)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityLabel("\(field.label): \(issue)")
        }
    }

    private var longTextEditor: some View {
        LabeledContent(label) {
            TextField(field.help ?? "Not recorded", text: textBinding, axis: .vertical)
                .lineLimit(1...8)
                .multilineTextAlignment(.trailing)
        }
    }

    private var measurementEditor: some View {
        LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                TextField("Not recorded", text: textBinding)
                    .multilineTextAlignment(.trailing)
                    .inventoryDecimalKeyboard()
                if let unit = field.fixedUnit {
                    Text(unit).foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private var referenceEditor: some View {
        let allowed = InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: referenceTargets)
        let current = referenceValue
        let kinds = field.references.targetKinds.sorted { $0.rawValue < $1.rawValue }
        let selectedKind = entry.referenceKind ?? current?.targetKind ?? kinds.first ?? .item
        return LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                if kinds.count > 1 {
                    Picker(
                        "Kind",
                        selection: Binding(get: { selectedKind }, set: { setReferenceKind($0) })
                    ) {
                        ForEach(kinds, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                Picker(
                    "Record",
                    selection: referenceSelection(allowed: allowed, selectedKind: selectedKind)
                ) {
                    Text("Not recorded").tag("")
                    if let current,
                        !allowed.contains(where: {
                            $0.kind == current.targetKind && $0.id == current.targetId
                        })
                    {
                        Text(readOnlyReference(current)).tag(current.targetId)
                    }
                    ForEach(allowed.filter { $0.kind == selectedKind }) { target in
                        Text(target.label).tag(target.id)
                    }
                }
                .pickerStyle(.menu)
            }
        }
    }

    private func referenceSelection(
        allowed: [InventoryProtocol2ReferenceTarget], selectedKind: InventoryReferenceTargetKind
    ) -> Binding<String> {
        Binding(
            get: { referenceValue?.targetId ?? "" },
            set: { id in
                let target = allowed.first { $0.id == id && $0.kind == selectedKind }
                setValue(target.map { .reference($0.value) })
            })
    }

    private var textBinding: Binding<String> {
        Binding(get: { entry.input }, set: { setText($0) })
    }

    private var scalarSelection: Binding<String> {
        Binding(
            get: { entry.value.map(InventoryProtocol2ValueText.input) ?? "" },
            set: { choice in setValue(choice.isEmpty ? nil : .boolean(choice == "true")) })
    }

    private var enumSelection: Binding<String> {
        Binding(
            get: {
                guard case .enumeration(let id)? = entry.value else { return "" }
                return id
            },
            set: { setValue($0.isEmpty ? nil : .enumeration(optionId: $0)) })
    }

    private var enumOptions: [InventoryCatalogueOption] {
        let selected: String?
        if case .enumeration(let id)? = entry.value { selected = id } else { selected = nil }
        return InventoryProtocol2EnumOptions.selectable(for: field, retaining: selected)
    }

    private var referenceValue: InventoryReferenceValue? {
        guard case .reference(let value)? = entry.value else { return nil }
        return value
    }

    private func readOnlyReference(_ reference: InventoryReferenceValue) -> String {
        InventoryProtocol2Display.text(
            for: [.reference(reference)], field: field, referenceLabel: { _ in nil })
    }
}
