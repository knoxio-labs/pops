import AppCore
import DesignSystem
import Foundation
import SwiftUI
import UniformTypeIdentifiers

internal struct InventoryProtocol2FieldRow: View {
    let field: InventoryCatalogueField
    let entries: [InventoryProtocol2DraftEntry]
    /// The server's evaluation reconciled with this phone's own changes, nil
    /// when the field has never been evaluated (an item still being created)
    /// or the field is not computed.
    let computedDisplay: InventoryComputedDisplay?
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
    @State private var draggedEntryID: String?
    @State private var activeSwipeEntryID: String?

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

    /// One entry of a many-valued field with drag reordering and swipe removal.
    private func manyEntryRow(
        _ entry: InventoryProtocol2DraftEntry, index: Int, count: Int
    ) -> some View {
        HStack(alignment: .center, spacing: PopsSpacing.xs) {
            reorderHandle(entry, index: index, count: count)
            editor(
                entry,
                label: InventoryProtocol2RowAccessibility.entryValue(
                    fieldLabel: field.label, index: index, count: count),
                identifier: InventoryAccessibility.protocol2FieldEntry(id: field.id, index: index),
                showsLabel: false)
        }
        .contentShape(.rect)
        .onDrop(
            of: [.plainText],
            delegate: InventoryProtocol2EntryDropDelegate(
                targetID: entry.id, entries: entries, draggedID: $draggedEntryID, move: move)
        )
        .popsGroundedSwipeRow(isActive: activeSwipeEntryID == entry.id)
        .popsGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { presented in
                if presented {
                    activeSwipeEntryID = entry.id
                } else if activeSwipeEntryID == entry.id {
                    activeSwipeEntryID = nil
                }
            },
            actions: {
                Button(role: .destructive) {
                    remove(entry.id)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .accessibilityIdentifier(
                    InventoryAccessibility.protocol2FieldRemove(id: field.id, index: index)
                )
                .accessibilityLabel(
                    InventoryProtocol2RowAccessibility.removeEntry(
                        fieldLabel: field.label, index: index, count: count))
            })
    }

    private func reorderHandle(
        _ entry: InventoryProtocol2DraftEntry, index: Int, count: Int
    ) -> some View {
        InventorySymbol.reorder.image
            .font(.popsHeadline)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            .contentShape(.rect)
            .onDrag {
                draggedEntryID = entry.id
                return NSItemProvider(object: entry.id as NSString)
            }
            .accessibilityIdentifier(
                InventoryAccessibility.protocol2FieldReorder(id: field.id, index: index)
            )
            .accessibilityLabel(
                InventoryProtocol2RowAccessibility.reorderHandle(
                    fieldLabel: field.label, index: index, count: count)
            )
            .accessibilityHint("Drag to reorder")
    }
}

private struct InventoryProtocol2EntryDropDelegate: DropDelegate {
    let targetID: String
    let entries: [InventoryProtocol2DraftEntry]
    @Binding var draggedID: String?
    let move: (String, Int) -> Void

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [.plainText])
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        guard let draggedID, draggedID != targetID,
            let sourceIndex = entries.firstIndex(where: { $0.id == draggedID }),
            let targetIndex = entries.firstIndex(where: { $0.id == targetID }),
            sourceIndex != targetIndex
        else { return }
        move(draggedID, targetIndex > sourceIndex ? 1 : -1)
    }

    func performDrop(info: DropInfo) -> Bool {
        draggedID = nil
        return true
    }
}

extension InventoryProtocol2FieldRow {
    private var computedFieldRow: InventoryProtocol2ComputedFieldRow {
        InventoryProtocol2ComputedFieldRow(
            field: field, display: computedDisplay, missingInputs: missingInputs)
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
        _ entry: InventoryProtocol2DraftEntry, label: String, identifier: String,
        showsLabel: Bool = true
    ) -> some View {
        InventoryProtocol2ValueEditor(
            field: field, entry: entry, label: label, showsLabel: showsLabel,
            identifier: identifier,
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
