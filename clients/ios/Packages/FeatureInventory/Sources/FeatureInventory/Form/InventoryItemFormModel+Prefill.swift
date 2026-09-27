import AppCore

extension InventoryItemFormModel {
    internal func startPrefill(
        source: InventoryPrefillSource, type: InventoryCatalogueType,
        currentDraft: InventoryProtocol2Draft
    ) {
        let includeName = draft.trimmedName.isEmpty
        prefillFailure = nil
        prefillStatus = .running
        fillTask = Task {
            let values = await scan.engine.fill(
                source: source, type: type, draft: currentDraft, includeName: includeName,
                reportFailure: { failure in await self.recordPrefillFailure(failure) })
            guard !Task.isCancelled else { return }
            applySuggestions(values, forTypeId: currentDraft.typeId)
            if let prefillFailure { prefillStatus = .lookupFailed(prefillFailure) }
        }
    }

    private func recordPrefillFailure(_ failure: PopsError) {
        guard !Task.isCancelled else { return }
        prefillFailure = failure
        scanFailure = failure
    }

    internal func applySuggestions(
        _ values: [String: [InventoryPrimitiveValue]], forTypeId typeId: String
    ) {
        guard protocol2Draft?.typeId == typeId else { return }

        var filled = false
        for (fieldId, suggestions) in values {
            if fieldId == InventoryPrefillName.id {
                guard draft.trimmedName.isEmpty,
                    case .string(let name)? = suggestions.first
                else { continue }
                let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmedName.isEmpty else { continue }
                draft.name = trimmedName
                filled = true
                continue
            }
            guard let field = protocol2Type?.fields.first(where: { $0.id == fieldId }) else {
                continue
            }
            let wasEmpty = protocol2Draft?.isEmpty(field) == true
            protocol2Draft?.fillIfEmpty(suggestions, for: field)
            filled = filled || (wasEmpty && protocol2Draft?.isEmpty(field) == false)
        }
        prefillStatus = filled ? nil : .nothingFound
    }
}
