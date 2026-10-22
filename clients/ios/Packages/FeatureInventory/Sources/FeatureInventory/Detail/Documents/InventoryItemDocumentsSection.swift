import AppCore
import DesignSystem
import QuickLook
import SwiftUI

/// The item's Paperless documents: linked files that open in QuickLook,
/// uploads Paperless is still processing or refused, and Add document.
/// Read online; drawn from the last list or the replica until the server
/// answers, so the item page never waits on it.
internal struct InventoryItemDocumentsSection: View {
    @State private var model: InventoryItemDocumentsModel

    internal init(
        itemId: InventoryItem.ID, replica: InventoryDocumentsStatus,
        service: any InventoryDocumentsService
    ) {
        _model = State(
            initialValue: InventoryItemDocumentsModel(
                itemId: itemId, replica: replica, service: service))
    }

    internal var body: some View {
        InventoryItemDocumentsContent(model: model)
            .task(id: model.itemId) { await model.watch() }
    }
}

/// The section's drawing, split from the loader so a test or preview can
/// hand it a model directly.
internal struct InventoryItemDocumentsContent: View {
    @Bindable internal var model: InventoryItemDocumentsModel

    internal var body: some View {
        let state = model.state
        Group {
            if !state.rows.isEmpty || state.notice != nil {
                InventoryItemDetailGroup(InventoryDocumentCopy.sectionTitle) {
                    if state.notice == .paperlessUnavailable {
                        PopsNotice(tone: .warning, text: InventoryDocumentCopy.paperlessUnavailable)
                        {
                            InventoryItemDetailRetryButton { Task { await model.load() } }
                        }
                    }
                    ForEach(state.rows) { row in
                        InventoryDocumentRowView(
                            row: row, note: model.rowNotes[row.id],
                            isOpening: model.opening == row.id
                        ) {
                            Task { await model.open(row) }
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        .popsMotion(value: state)
        .quickLookPreview($model.preview)
        .alert(
            InventoryDocumentCopy.notChanged,
            isPresented: Binding(
                get: { model.message != nil }, set: { if !$0 { model.message = nil } }),
            actions: { Button("OK", role: .cancel) {} },
            message: { Text(model.message ?? "") })
    }
}
