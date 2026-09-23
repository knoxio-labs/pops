import AppCore

/// Sets or clears one computed field's override immediately, unlike the rest
/// of the form: `item.setOverride`/`item.clearOverride` act on the item as it
/// stands on the server, and there is nothing to override before Create has
/// run, so these are refused outside Edit.
extension InventoryItemFormModel {
    internal func setComputedOverride(
        _ value: InventoryPrimitiveValue, for field: InventoryCatalogueField
    ) async {
        guard mode == .edit else { return }
        do {
            _ = try await store.perform(
                .setComputedOverride(id: draft.id, fieldId: field.id, value: value))
        } catch {
            record(error)
        }
    }

    internal func clearComputedOverride(for field: InventoryCatalogueField) async {
        guard mode == .edit else { return }
        do {
            _ = try await store.perform(
                .clearComputedOverride(id: draft.id, fieldId: field.id))
        } catch {
            record(error)
        }
    }
}
