import AppCore

/// Sets or clears one computed field's override. While editing, it acts on
/// the item immediately, unlike the rest of the form: `item.setOverride` and
/// `item.clearOverride` act on the item as it stands on the server. Before
/// Create has run there is no item yet, so the override is staged on the
/// draft and travels inside the create itself.
extension InventoryItemFormModel {
    internal func setComputedOverride(
        _ value: InventoryPrimitiveValue, for field: InventoryCatalogueField
    ) async {
        guard mode == .edit else {
            protocol2Draft?.overrides[field.id] = value
            return
        }
        do {
            _ = try await store.perform(
                .setComputedOverride(id: draft.id, fieldId: field.id, value: value))
        } catch {
            record(error)
        }
    }

    internal func clearComputedOverride(for field: InventoryCatalogueField) async {
        guard mode == .edit else {
            protocol2Draft?.overrides.removeValue(forKey: field.id)
            return
        }
        do {
            _ = try await store.perform(
                .clearComputedOverride(id: draft.id, fieldId: field.id))
        } catch {
            record(error)
        }
    }

    /// What a computed field's row shows: an override staged on a new item's
    /// draft wins over whatever the field would otherwise show.
    internal func computedDisplay(
        for field: InventoryCatalogueField
    ) -> InventoryComputedDisplay? {
        if let staged = protocol2Draft?.overrides[field.id] { return .overridden(staged) }
        return protocol2ComputedDisplays[field.id]
    }
}
