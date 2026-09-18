import AppCore
import SwiftUI

extension View {
    /// Installs the item form as a full-height sheet over this view, and puts
    /// `inventoryItemForm` in the environment so any screen below can open
    /// it with an `InventoryItemFormRequest`.
    internal func inventoryItemFormPresentation(
        store: any InventoryStore, suggester: InventoryCodeSuggester = .unbound
    ) -> some View {
        modifier(InventoryItemFormPresentation(store: store, suggester: suggester))
    }
}

private struct InventoryItemFormPresentation: ViewModifier {
    let store: any InventoryStore
    let suggester: InventoryCodeSuggester
    @State private var request: InventoryItemFormRequest?
    @Environment(\.inventoryPlacementPicker) private var picker

    func body(content: Content) -> some View {
        content
            .environment(\.inventoryItemForm, InventoryItemFormPresenter { request = $0 })
            .sheet(item: $request) { request in
                InventoryItemFormSheet(request: request, store: store, suggester: suggester)
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
        suggester: InventoryCodeSuggester
    ) {
        _model = State(
            wrappedValue: InventoryItemFormModel(
                request: request, store: store, suggester: suggester))
    }

    var body: some View {
        InventoryItemFormView(model: model)
    }
}
