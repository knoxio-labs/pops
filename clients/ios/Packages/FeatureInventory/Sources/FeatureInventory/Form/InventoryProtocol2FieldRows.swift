import AppCore
import DesignSystem
import SwiftUI

internal struct InventoryProtocol2FieldRow: View {
    let field: InventoryCatalogueField
    let entries: [InventoryProtocol2DraftEntry]
    let computedValues: [InventoryPrimitiveValue]
    let unavailableReason: InventoryValueUnavailableReason?
    let referenceTargets: [InventoryProtocol2ReferenceTarget]
    let setText: (String, String) -> Void
    let setValue: (InventoryPrimitiveValue?, String) -> Void
    let setReferenceKind: (InventoryReferenceTargetKind, String) -> Void
    let add: () -> Void
    let remove: (String) -> Void
    let move: (String, Int) -> Void

    @ViewBuilder var body: some View {
        if field.storage == .computed || field.archivedAt != nil {
            LabeledContent(field.label) { Text(readOnlyText) }
                .accessibilityElement(children: .combine)
        } else if field.cardinality == .many {
            manyEditor
        } else if let entry = entries.first {
            editor(entry, label: field.label)
        }
    }

    private var manyEditor: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(field.label)
                .font(.popsHeadline)
                .accessibilityAddTraits(.isHeader)
            if let help = field.help {
                Text(help)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                    editor(entry, label: "Value \(index + 1)")
                    Menu("Reorder value \(index + 1)", systemImage: "arrow.up.arrow.down") {
                        Button("Move earlier") { move(entry.id, -1) }
                            .disabled(index == 0)
                        Button("Move later") { move(entry.id, 1) }
                            .disabled(index == entries.count - 1)
                        Button("Remove", systemImage: "trash", role: .destructive) {
                            remove(entry.id)
                        }
                    }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Actions for \(field.label) value \(index + 1)")
                }
            }
            Button("Add \(field.label)", systemImage: "plus", action: add)
                .buttonStyle(.borderless)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

extension InventoryProtocol2FieldRow {
    @ViewBuilder private func editor(
        _ entry: InventoryProtocol2DraftEntry, label: String
    ) -> some View {
        switch field.kind {
        case .boolean:
            Picker(label, selection: scalarSelection(entry)) {
                Text("Not recorded").tag("")
                Text("Yes").tag("true")
                Text("No").tag("false")
            }
            .pickerStyle(.menu)
        case .enumeration:
            Picker(label, selection: enumSelection(entry)) {
                Text("Not recorded").tag("")
                ForEach(enumOptions(for: entry)) { option in
                    Text(option.archivedAt == nil ? option.label : "\(option.label) (Retired)")
                        .tag(option.id)
                }
            }
            .pickerStyle(.menu)
        case .reference:
            referenceEditor(entry, label: label)
        case .longText:
            longTextEditor(entry, label: label)
        case .measurement:
            measurementEditor(entry, label: label)
        default:
            InventoryFormTextRow(
                label, placeholder: field.help ?? "Not recorded", text: textBinding(entry))
        }
        if let issue = entry.issue {
            Text(issue)
                .font(.popsCaption)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityLabel("\(field.label): \(issue)")
        }
    }

    private func longTextEditor(
        _ entry: InventoryProtocol2DraftEntry, label: String
    ) -> some View {
        LabeledContent(label) {
            TextField(
                field.help ?? "Not recorded", text: textBinding(entry), axis: .vertical
            )
            .lineLimit(1...8)
            .multilineTextAlignment(.trailing)
        }
    }

    private func measurementEditor(
        _ entry: InventoryProtocol2DraftEntry, label: String
    ) -> some View {
        LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                TextField("Not recorded", text: textBinding(entry))
                    .multilineTextAlignment(.trailing)
                    .inventoryDecimalKeyboard()
                if let unit = field.fixedUnit {
                    Text(unit).foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func referenceEditor(
        _ entry: InventoryProtocol2DraftEntry, label: String
    ) -> some View {
        let allowed = InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: referenceTargets)
        let current = referenceValue(entry)
        let kinds = field.references.targetKinds.sorted { $0.rawValue < $1.rawValue }
        let selectedKind = entry.referenceKind ?? current?.targetKind ?? kinds.first ?? .item
        return LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                if kinds.count > 1 {
                    Picker(
                        "Kind",
                        selection: Binding(
                            get: { selectedKind },
                            set: { setReferenceKind($0, entry.id) })
                    ) {
                        ForEach(kinds, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                Picker(
                    "Record",
                    selection: referenceSelection(
                        entry, allowed: allowed, selectedKind: selectedKind)
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
        _ entry: InventoryProtocol2DraftEntry,
        allowed: [InventoryProtocol2ReferenceTarget],
        selectedKind: InventoryReferenceTargetKind
    ) -> Binding<String> {
        Binding(
            get: { referenceValue(entry)?.targetId ?? "" },
            set: { id in
                let target = allowed.first { $0.id == id && $0.kind == selectedKind }
                setValue(target.map { .reference($0.value) }, entry.id)
            })
    }

    private func textBinding(_ entry: InventoryProtocol2DraftEntry) -> Binding<String> {
        Binding(get: { entry.input }, set: { setText($0, entry.id) })
    }

    private func scalarSelection(_ entry: InventoryProtocol2DraftEntry) -> Binding<String> {
        Binding(
            get: { entry.value.map(InventoryProtocol2ValueText.input) ?? "" },
            set: { choice in
                setValue(choice.isEmpty ? nil : .boolean(choice == "true"), entry.id)
            })
    }

    private func enumSelection(_ entry: InventoryProtocol2DraftEntry) -> Binding<String> {
        Binding(
            get: {
                guard case .enumeration(let id)? = entry.value else { return "" }
                return id
            },
            set: { setValue($0.isEmpty ? nil : .enumeration(optionId: $0), entry.id) })
    }

    private func enumOptions(
        for entry: InventoryProtocol2DraftEntry
    ) -> [InventoryCatalogueOption] {
        let selected: String?
        if case .enumeration(let id)? = entry.value { selected = id } else { selected = nil }
        return InventoryProtocol2EnumOptions.selectable(for: field, retaining: selected)
    }

    private func referenceValue(
        _ entry: InventoryProtocol2DraftEntry
    ) -> InventoryReferenceValue? {
        guard case .reference(let value)? = entry.value else { return nil }
        return value
    }

    private var readOnlyText: String {
        if let unavailableReason {
            return InventoryProtocol2Display.unavailable(unavailableReason)
        }
        let values = field.storage == .computed ? computedValues : entries.compactMap(\.value)
        return InventoryProtocol2Display.text(
            for: values, field: field,
            referenceLabel: { reference in
                referenceTargets.first {
                    $0.kind == reference.targetKind && $0.id == reference.targetId
                }?.label
            })
    }

    private func readOnlyReference(_ reference: InventoryReferenceValue) -> String {
        InventoryProtocol2Display.text(
            for: [.reference(reference)], field: field, referenceLabel: { _ in nil })
    }
}
