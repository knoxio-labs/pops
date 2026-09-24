import AppCore

/// ADR-002 D3: a container's quantity is always exactly 1, so the form locks
/// the quantity control instead of offering a value the server would refuse.
extension InventoryItemFormModel {
    /// Whether the selected type grants containment (ADR-002 D1).
    internal var selectedTypeIsContainer: Bool {
        if let type = protocol2Type { return type.isContainer }
        guard let typeKey = draft.typeKey else { return false }
        return catalogue.types.first(where: { $0.key == typeKey })?.isContainer ?? false
    }

    /// Sets the legacy (protocol-1) type, clamping quantity to 1 when the
    /// new type is a container: a grouped item can never be one (D3).
    internal func selectLegacyType(_ typeKey: String?) {
        draft.typeKey = typeKey
        if let typeKey, catalogue.types.first(where: { $0.key == typeKey })?.isContainer == true {
            draft.quantity = 1
        }
    }
}
