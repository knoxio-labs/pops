import AppCore

extension InventoryItemFormModel {
    internal func startPrefill(
        source: InventoryPrefillSource, type: InventoryCatalogueType,
        currentDraft: InventoryProtocol2Draft,
        initialValues: [String: [InventoryPrimitiveValue]] = [:]
    ) {
        let deterministicFilled = applySuggestions(initialValues, forTypeId: currentDraft.typeId)
        let preparedDraft = protocol2Draft ?? currentDraft
        let includeName = draft.trimmedName.isEmpty
        prefillFailure = nil
        prefillStatus = .running
        fillTask = Task {
            let values = await scan.engine.fill(
                source: source, type: type, draft: preparedDraft, includeName: includeName,
                reportFailure: { failure in await self.recordPrefillFailure(failure) })
            guard !Task.isCancelled else { return }
            let generatedFilled = applySuggestions(values, forTypeId: currentDraft.typeId)
            if deterministicFilled && !generatedFilled && prefillFailure == nil {
                prefillStatus = nil
            }
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
    ) -> Bool {
        guard protocol2Draft?.typeId == typeId else { return false }

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
        return filled
    }
}
