import AppCore

extension InventoryItemFormModel {
    internal func applySuggestions(
        _ values: [String: [InventoryPrimitiveValue]], forTypeId typeId: String
    ) {
        guard protocol2Draft?.typeId == typeId else { return }

        var filled = false
        for (fieldId, suggestions) in values {
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
