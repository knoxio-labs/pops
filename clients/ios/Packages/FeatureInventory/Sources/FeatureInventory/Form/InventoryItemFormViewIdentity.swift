import AppCore
import DesignSystem
import SwiftUI

extension InventoryItemFormView {
    internal var identity: some View {
        Section {
            InventoryFormTextRow(
                "Name", placeholder: "Name", text: $model.draft.name,
                identifier: InventoryAccessibility.itemNameField)
            InventoryFormDestinationRow(draft: $model.draft)
            if let type = model.protocol2Type, let draft = model.protocol2Draft {
                protocol2FieldRows(type: type, draft: draft)
            } else if model.protocol2Catalogue == nil {
                legacyFieldRows
            }
        } footer: {
            footer(for: identityIssues, additional: protocol2IssueMessages)
        }
    }

    @ViewBuilder
    private func protocol2FieldRows(
        type: InventoryCatalogueType, draft: InventoryProtocol2Draft
    ) -> some View {
        ForEach(
            type.fields.filter { field in
                if field.archivedAt == nil { return true }
                if field.storage == .computed {
                    return model.protocol2ComputedDisplays[field.id] != nil
                }
                return !draft.values(for: field).isEmpty
            }
        ) { field in
            InventoryProtocol2FieldRow(
                field: field, entries: draft.draftEntries(for: field),
                computedDisplay: model.computedDisplay(for: field),
                referenceTargets: model.protocol2ReferenceTargets,
                missingInputs: model.protocol2ComputedMissingInputs[field.id] ?? [],
                setText: { value, id in
                    model.protocol2Draft?.setText(value, entryId: id, for: field)
                },
                setValue: { value, id in
                    model.protocol2Draft?.setValue(value, entryId: id, for: field)
                },
                setReferenceKind: { kind, id in
                    model.protocol2Draft?.setReferenceKind(kind, entryId: id, for: field)
                },
                add: { model.addProtocol2Value(for: field) },
                remove: { model.protocol2Draft?.removeEntry(id: $0, for: field) },
                move: { model.protocol2Draft?.moveEntry(id: $0, by: $1, for: field) },
                setOverride: { value in
                    Task { await model.setComputedOverride(value, for: field) }
                },
                clearOverride: {
                    Task { await model.clearComputedOverride(for: field) }
                })
        }
    }

    private var legacyFieldRows: some View {
        ForEach(model.fields) { field in
            InventoryFormFieldRow(
                field: field,
                entry: model.draft.entry(for: field, units: model.catalogue.units),
                units: InventoryFormUnits.options(for: field, in: model.catalogue.units)
            ) { model.draft.set($0, for: field) }
            .transition(.opacity)
        }
    }

    private var identityIssues: [InventoryDraftIssue] {
        guard model.showsValidation else { return [] }
        return model.issues.filter { issue in
            switch issue {
            case .codeTaken, .identifierIncomplete, .identifierInvalid: false
            default: true
            }
        }
    }

    private var protocol2IssueMessages: [String] {
        guard model.showsValidation else { return [] }
        return model.protocol2Issues.map(\.message)
    }
}
