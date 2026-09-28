import AppCore
import SwiftUI

extension View {
    /// Installs the item form as a full-height sheet over this view, and puts
    /// `inventoryItemForm` in the environment so any screen below can open
    /// it with an `InventoryItemFormRequest`. A nested chooser can supply
    /// `onCreated` to close itself after a successful new-item write.
    internal func inventoryItemFormPresentation(
        store: any InventoryStore, suggester: InventoryCodeSuggester? = nil,
        scan: InventoryScanPrefill? = nil,
        onCreated: @escaping @MainActor () -> Void = {}
    ) -> some View {
        modifier(
            InventoryItemFormPresentation(
                store: store, suggester: suggester, scan: scan, onCreated: onCreated))
    }
}

private struct InventoryItemFormPresentation: ViewModifier {
    let store: any InventoryStore
    let suggester: InventoryCodeSuggester?
    let scan: InventoryScanPrefill?
    let onCreated: @MainActor () -> Void
    @State private var request: InventoryItemFormRequest?
    @Environment(\.inventoryPlacementPicker) private var picker
    @Environment(\.inventoryCodeSuggester) private var inheritedSuggester
    @Environment(\.inventoryScanPrefill) private var inheritedScan

    init(
        store: any InventoryStore, suggester: InventoryCodeSuggester?,
        scan: InventoryScanPrefill?, onCreated: @escaping @MainActor () -> Void
    ) {
        self.store = store
        self.suggester = suggester
        self.scan = scan
        self.onCreated = onCreated
    }

    func body(content: Content) -> some View {
        let resolvedSuggester = suggester ?? inheritedSuggester ?? .unbound
        let resolvedScan = scan ?? inheritedScan ?? .unbound
        content
            .environment(\.inventoryItemForm, InventoryItemFormPresenter { request = $0 })
            .environment(\.inventoryCodeSuggester, resolvedSuggester)
            .environment(\.inventoryScanPrefill, resolvedScan)
            .sheet(item: $request) { request in
                InventoryItemFormSheet(
                    request: request, store: store, suggester: resolvedSuggester,
                    scan: resolvedScan,
                    onCreated: onCreated
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
    private let onCreated: @MainActor () -> Void

    init(
        request: InventoryItemFormRequest, store: any InventoryStore,
        suggester: InventoryCodeSuggester, scan: InventoryScanPrefill,
        onCreated: @escaping @MainActor () -> Void
    ) {
        _model = State(
            wrappedValue: InventoryItemFormModel(
                request: request, store: store, suggester: suggester, scan: scan))
        self.onCreated = onCreated
    }

    var body: some View {
        InventoryItemFormView(model: model, onCreated: onCreated)
    }
}
