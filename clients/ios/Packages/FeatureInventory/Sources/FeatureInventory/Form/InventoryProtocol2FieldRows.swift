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
    /// The label of another field on this type, for naming what a computed
    /// field is waiting on.
    let dependencyLabel: (String) -> String?
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
    private var computedFieldRow: InventoryProtocol2ComputedFieldRow {
        InventoryProtocol2ComputedFieldRow(
            field: field, display: computedDisplay, overridesEnabled: overridesEnabled)
    }

    @ViewBuilder private var computedRow: some View {
        let row = computedFieldRow
        if let overrideEntry {
            overrideEditor(overrideEntry)
        } else {
            LabeledContent {
                HStack(spacing: PopsSpacing.sm) {
                    Text(
                        row.text(
                            referenceLabel: referenceLabelLookup, dependencyLabel: dependencyLabel)
                    )
                    .foregroundStyle(row.isMuted ? Color.popsMutedForeground : .popsForeground)
                    if row.canStartOverride {
                        Button {
                            self.overrideEntry = InventoryProtocol2DraftEntry(id: "override")
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
        }
    }

    private func overrideEditor(_ entry: InventoryProtocol2DraftEntry) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryProtocol2ValueEditor(
                field: field, entry: entry, label: field.label, referenceTargets: referenceTargets,
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
        _ entry: InventoryProtocol2DraftEntry, label: String
    ) -> some View {
        InventoryProtocol2ValueEditor(
            field: field, entry: entry, label: label, referenceTargets: referenceTargets,
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
