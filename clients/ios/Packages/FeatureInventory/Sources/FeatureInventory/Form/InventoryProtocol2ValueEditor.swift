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
    let showsLabel: Bool
    /// The identifier a driver script addresses this entry's editor by.
    /// `InventoryAccessibility.protocol2Field(id:)` for a single-valued
    /// field's one entry, `protocol2FieldEntry(id:index:)` for one of a
    /// many-valued field's several — the caller decides which, since only it
    /// knows the entry's position, if any.
    let identifier: String
    let referenceTargets: [InventoryProtocol2ReferenceTarget]
    let setText: (String) -> Void
    let setValue: (InventoryPrimitiveValue?) -> Void
    let setReferenceKind: (InventoryReferenceTargetKind) -> Void

    internal init(
        field: InventoryCatalogueField, entry: InventoryProtocol2DraftEntry, label: String,
        showsLabel: Bool = true, identifier: String,
        referenceTargets: [InventoryProtocol2ReferenceTarget], setText: @escaping (String) -> Void,
        setValue: @escaping (InventoryPrimitiveValue?) -> Void,
        setReferenceKind: @escaping (InventoryReferenceTargetKind) -> Void
    ) {
        self.field = field
        self.entry = entry
        self.label = label
        self.showsLabel = showsLabel
        self.identifier = identifier
        self.referenceTargets = referenceTargets
        self.setText = setText
        self.setValue = setValue
        self.setReferenceKind = setReferenceKind
    }

    @ViewBuilder var body: some View {
        switch field.kind {
        case .boolean:
            booleanEditor
        case .enumeration:
            InventoryFormChoiceRow(
                label: label, fieldId: field.id, identifier: identifier,
                showsLabel: showsLabel,
                options: InventoryProtocol2EnumOptions.choices(
                    for: field, retaining: chosenOptionId),
                chosenId: chosenOptionId,
                chosenLabel: entry.value.map {
                    InventoryProtocol2Display.text(
                        for: [$0], field: field, referenceLabel: { _ in nil })
                },
                choose: { setValue($0.map { .enumeration(optionId: $0) }) })
        case .reference:
            referenceEditor
        case .longText:
            longTextEditor
        case .measurement:
            measurementEditor
        default:
            InventoryFormTextRow(
                label, placeholder: placeholder, text: textBinding,
                identifier: identifier, showsLabel: showsLabel)
        }
        if let issue = entry.issue {
            Text(issue)
                .font(.popsCaption)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityLabel("\(field.label): \(issue)")
        }
    }

    @ViewBuilder private var booleanEditor: some View {
        if showsLabel {
            Toggle(label, isOn: flagBinding)
                .accessibilityIdentifier(identifier)
        } else {
            Toggle(label, isOn: flagBinding)
                .labelsHidden()
                .accessibilityLabel(label)
                .accessibilityIdentifier(identifier)
        }
    }

    private var longTextEditor: some View {
        InventoryFormFocusableRow { focus in
            if showsLabel {
                LabeledContent(label) {
                    longTextField(focus: focus)
                }
            } else {
                longTextField(focus: focus)
            }
        }
    }

    private func longTextField(focus: FocusState<Bool>.Binding) -> some View {
        TextField(placeholder, text: textBinding, axis: .vertical)
            .focused(focus)
            .lineLimit(1...8)
            .multilineTextAlignment(.leading)
            .accessibilityLabel(label)
            .accessibilityIdentifier(identifier)
    }

    private var measurementEditor: some View {
        InventoryFormFocusableRow { focus in
            if showsLabel {
                LabeledContent(label) {
                    measurementFields(focus: focus)
                }
            } else {
                measurementFields(focus: focus)
            }
        }
    }

    private func measurementFields(focus: FocusState<Bool>.Binding) -> some View {
        HStack(spacing: PopsSpacing.sm) {
            TextField(placeholder, text: textBinding)
                .focused(focus)
                .multilineTextAlignment(.leading)
                .lineLimit(1)
                .inventoryDecimalKeyboard()
                .accessibilityLabel(label)
                .accessibilityIdentifier(identifier)
            if let unit = field.fixedUnit {
                Text(unit).foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    @ViewBuilder private var referenceEditor: some View {
        let allowed = InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: referenceTargets)
        let current = referenceValue
        let kinds = field.references.targetKinds.sorted { $0.rawValue < $1.rawValue }
        let selectedKind = entry.referenceKind ?? current?.targetKind ?? kinds.first ?? .item
        if showsLabel {
            LabeledContent(label) {
                referenceFields(
                    allowed: allowed, current: current, kinds: kinds, selectedKind: selectedKind)
            }
        } else {
            referenceFields(
                allowed: allowed, current: current, kinds: kinds, selectedKind: selectedKind
            )
            .accessibilityLabel(label)
        }
    }

    private func referenceFields(
        allowed: [InventoryProtocol2ReferenceTarget], current: InventoryReferenceValue?,
        kinds: [InventoryReferenceTargetKind], selectedKind: InventoryReferenceTargetKind
    ) -> some View {
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
                Text(InventoryFormBlank.placeholder).tag("")
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
            .accessibilityIdentifier(identifier)
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

    private var placeholder: String {
        InventoryProtocol2FieldHint.placeholder(for: field, showsLabel: showsLabel)
    }

    private var textBinding: Binding<String> {
        Binding(get: { entry.input }, set: { setText($0) })
    }

    /// A switch has no "not recorded" position, so an unrecorded flag reads
    /// as off and is only written once the person flips it.
    private var flagBinding: Binding<Bool> {
        Binding(
            get: { entry.value == .boolean(true) },
            set: { setValue(.boolean($0)) })
    }

    private var chosenOptionId: String? {
        guard case .enumeration(let id)? = entry.value else { return nil }
        return id
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
