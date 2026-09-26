import AppCore
import SwiftUI

extension View {
    /// Installs the item form as a full-height sheet over this view, and puts
    /// `inventoryItemForm` in the environment so any screen below can open
    /// it with an `InventoryItemFormRequest`.
    internal func inventoryItemFormPresentation(
        store: any InventoryStore, suggester: InventoryCodeSuggester = .unbound,
        scan: InventoryScanPrefill? = nil
    ) -> some View {
        modifier(InventoryItemFormPresentation(store: store, suggester: suggester, scan: scan))
    }
}

private struct InventoryItemFormPresentation: ViewModifier {
    let store: any InventoryStore
    let suggester: InventoryCodeSuggester
    let scan: InventoryScanPrefill?
    @State private var request: InventoryItemFormRequest?
    @Environment(\.inventoryPlacementPicker) private var picker
    @Environment(\.inventoryScanPrefill) private var inheritedScan

    func body(content: Content) -> some View {
        let resolvedScan = scan ?? inheritedScan ?? .unbound
        content
            .environment(\.inventoryItemForm, InventoryItemFormPresenter { request = $0 })
            .environment(\.inventoryScanPrefill, resolvedScan)
            .sheet(item: $request) { request in
                InventoryItemFormSheet(
                    request: request, store: store, suggester: suggester, scan: resolvedScan
                )
                .environment(\.inventoryPlacementPicker, picker)
                .presentationDetents([.large])
            }
    }
}

/// Holds the form's model for the sheet's lifetime, so a re-render of the
/// presenter does not start the draft over.
private struct InventoryItemFormSheet: View {
    @State private var model: InventoryItemFormModel

    init(
        request: InventoryItemFormRequest, store: any InventoryStore,
        suggester: InventoryCodeSuggester, scan: InventoryScanPrefill
    ) {
        _model = State(
            wrappedValue: InventoryItemFormModel(
                request: request, store: store, suggester: suggester, scan: scan))
    }

    var body: some View {
        InventoryItemFormView(model: model)
    }
}
