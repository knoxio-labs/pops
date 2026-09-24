import AppCore
import DesignSystem
import SwiftUI

internal struct InventoryProtocol2FieldRow: View {
    let field: InventoryCatalogueField
    let entries: [InventoryProtocol2DraftEntry]
    /// The server's evaluation reconciled with this phone's own changes, nil
    /// when the field has never been evaluated (an item still being created)
    /// or the field is not computed.
    let computedDisplay: InventoryComputedDisplay?
    /// Whether an override can be set or cleared right now: only once the
    /// item exists, since the reducer requires it (there is nothing to
    /// override before Create has run).
    let overridesEnabled: Bool
    let referenceTargets: [InventoryProtocol2ReferenceTarget]
    /// What a computed field is waiting on while it is unavailable, named.
    let missingInputs: [InventoryMissingInput]
    let setText: (String, String) -> Void
    let setValue: (InventoryPrimitiveValue?, String) -> Void
    let setReferenceKind: (InventoryReferenceTargetKind, String) -> Void
    let add: () -> Void
    let remove: (String) -> Void
    let move: (String, Int) -> Void
    let setOverride: (InventoryPrimitiveValue) -> Void
    let clearOverride: () -> Void

    @State private var overrideEntry: InventoryProtocol2DraftEntry?

    @ViewBuilder var body: some View {
        if field.storage == .computed {
            computedRow
        } else if field.archivedAt != nil {
            LabeledContent(field.label) { Text(readOnlyText) }
                .accessibilityElement(children: .combine)
        } else if field.cardinality == .many {
            manyEditor
        } else if let entry = entries.first {
            editor(
                entry, label: field.label,
                identifier: InventoryAccessibility.protocol2Field(id: field.id))
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
                manyEntryRow(entry, index: index, count: entries.count)
            }
            Button("Add \(field.label)", systemImage: "plus", action: add)
                .buttonStyle(.borderless)
                .accessibilityIdentifier(InventoryAccessibility.protocol2FieldAdd(id: field.id))
                .accessibilityLabel(
                    InventoryProtocol2RowAccessibility.addEntry(fieldLabel: field.label))
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    /// One entry of a many-valued field: its scalar editor plus three plain
    /// icon buttons rather than a `Menu` — a `Menu` is the same flaky
    /// control class automation already routes around for the Type picker
    /// (POPS-4556), and iOS 27's own pattern for a row's few actions is
    /// icon buttons in place, not a disclosure into a popover.
    private func manyEntryRow(
        _ entry: InventoryProtocol2DraftEntry, index: Int, count: Int
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.xs) {
            editor(
                entry,
                label: InventoryProtocol2RowAccessibility.entryValue(
                    fieldLabel: field.label, index: index, count: count),
                identifier: InventoryAccessibility.protocol2FieldEntry(id: field.id, index: index))
            moveEarlierButton(entry, index: index, isFirst: index == 0)
            moveLaterButton(entry, index: index, isLast: index == count - 1)
            removeButton(entry, index: index)
        }
    }

    private func moveEarlierButton(
        _ entry: InventoryProtocol2DraftEntry, index: Int, isFirst: Bool
    ) -> some View {
        Button {
            move(entry.id, -1)
        } label: {
            Image(systemName: "arrow.up")
        }
        .buttonStyle(.borderless)
        .disabled(isFirst)
        .accessibilityIdentifier(
            InventoryAccessibility.protocol2FieldMoveEarlier(id: field.id, index: index)
        )
        .accessibilityLabel(
            InventoryProtocol2RowAccessibility.moveEarlier(fieldLabel: field.label, index: index))
    }

    private func moveLaterButton(
        _ entry: InventoryProtocol2DraftEntry, index: Int, isLast: Bool
    ) -> some View {
        Button {
            move(entry.id, 1)
        } label: {
            Image(systemName: "arrow.down")
        }
        .buttonStyle(.borderless)
        .disabled(isLast)
        .accessibilityIdentifier(
            InventoryAccessibility.protocol2FieldMoveLater(id: field.id, index: index)
        )
        .accessibilityLabel(
            InventoryProtocol2RowAccessibility.moveLater(fieldLabel: field.label, index: index))
    }

    private func removeButton(_ entry: InventoryProtocol2DraftEntry, index: Int) -> some View {
        Button(role: .destructive) {
            remove(entry.id)
        } label: {
            Image(systemName: "trash")
        }
        .buttonStyle(.borderless)
        .accessibilityIdentifier(
            InventoryAccessibility.protocol2FieldRemove(id: field.id, index: index)
        )
        .accessibilityLabel(
            InventoryProtocol2RowAccessibility.removeEntry(fieldLabel: field.label, index: index))
    }
}

extension InventoryProtocol2FieldRow {
    private var computedFieldRow: InventoryProtocol2ComputedFieldRow {
        InventoryProtocol2ComputedFieldRow(
            field: field, display: computedDisplay, overridesEnabled: overridesEnabled,
            missingInputs: missingInputs)
    }

    @ViewBuilder private var computedRow: some View {
        let row = computedFieldRow
        if let overrideEntry {
            overrideEditor(overrideEntry)
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                computedValue(row)
                if !row.listedMissingInputs.isEmpty {
                    InventoryMissingInputsList(inputs: row.listedMissingInputs)
                }
            }
        }
    }

    private func computedValue(_ row: InventoryProtocol2ComputedFieldRow) -> some View {
        LabeledContent {
            HStack(spacing: PopsSpacing.sm) {
                Text(row.text(referenceLabel: referenceLabelLookup))
                    .foregroundStyle(row.isMuted ? Color.popsMutedForeground : .popsForeground)
                if row.canStartOverride {
                    Button {
                        // A switch always shows an answer, so a flag's override
                        // starts as the off it shows.
                        self.overrideEntry = InventoryProtocol2DraftEntry(
                            id: "override", value: field.kind == .boolean ? .boolean(false) : nil)
                    } label: {
                        Image(systemName: "pencil.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Override \(field.label)")
                } else if row.canClearOverride {
                    Button(action: clearOverride) {
                        Image(systemName: "arrow.uturn.backward.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Clear \(field.label) override")
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(field.label)
                if let caption = row.caption {
                    Text(caption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            InventoryProtocol2RowAccessibility.computed(
                fieldLabel: field.label, valueText: row.text(referenceLabel: referenceLabelLookup),
                caption: row.caption))
    }

    private func overrideEditor(_ entry: InventoryProtocol2DraftEntry) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryProtocol2ValueEditor(
                field: field, entry: entry, label: field.label,
                identifier: InventoryAccessibility.protocol2Field(id: field.id),
                referenceTargets: referenceTargets,
                setText: { overrideEntry?.setText($0, for: field) },
                setValue: { overrideEntry?.setValue($0) },
                setReferenceKind: { overrideEntry?.setReferenceKind($0) })
            HStack {
                Button("Cancel") { overrideEntry = nil }
                    .buttonStyle(.borderless)
                Spacer()
                Button("Set override") {
                    guard let value = entry.value else { return }
                    setOverride(value)
                    overrideEntry = nil
                }
                .buttonStyle(.borderedProminent)
                .disabled(entry.value == nil)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

extension InventoryProtocol2FieldRow {
    private func editor(
        _ entry: InventoryProtocol2DraftEntry, label: String, identifier: String
    ) -> some View {
        InventoryProtocol2ValueEditor(
            field: field, entry: entry, label: label, identifier: identifier,
            referenceTargets: referenceTargets,
            setText: { setText($0, entry.id) },
            setValue: { setValue($0, entry.id) },
            setReferenceKind: { setReferenceKind($0, entry.id) })
    }

    private var readOnlyText: String {
        InventoryProtocol2Display.text(
            for: entries.compactMap(\.value), field: field, referenceLabel: referenceLabelLookup)
    }

    private var referenceLabelLookup: (InventoryReferenceValue) -> String? {
        { reference in
            referenceTargets.first {
                $0.kind == reference.targetKind && $0.id == reference.targetId
            }?.label
        }
    }
}
