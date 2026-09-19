import DesignSystem
import SwiftUI

/// The item detail page: the photographs, who it is, where it is, the fields
/// its type highlights, the verbs, and then whatever else is recorded.
///
/// One scroll view for the whole page, with the photograph running under the
/// navigation bar. The top of the page answers "is this the thing in my hand,
/// and where does it live" before any scrolling; everything under the verbs
/// is compact grouped rows that follow it up the screen.
///
/// A capability's own section arrives through `capability`, and its verbs
/// through `actions` and `onAction`; without them the page is exactly the
/// plain item page.
internal struct InventoryItemDetailView<Capability: View>: View {
    internal let detail: InventoryItemDetail
    @Bindable internal var model: InventoryItemDetailViewModel
    private let actions: [InventoryAction]?
    private let onAction: ((InventoryAction) -> Void)?
    private let capability: Capability
    @State private var destroying = false
    @State private var quantitySheet: InventoryLifecycleSheet?
    @State private var pending: InventoryItemDetailPending?
    @State private var moving: InventoryPlacementRequest?
    @State private var storing = false
    @Environment(\.inventoryItemForm) private var itemForm

    internal init(
        detail: InventoryItemDetail,
        model: InventoryItemDetailViewModel,
        actions: [InventoryAction]? = nil,
        onAction: ((InventoryAction) -> Void)? = nil,
        @ViewBuilder capability: () -> Capability
    ) {
        self.detail = detail
        self.model = model
        self.actions = actions
        self.onAction = onAction
        self.capability = capability()
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                InventoryItemDetailHeader(detail: detail) { await model.photo($0, variant: $1) }
                InventoryItemDetailFacts(detail: detail)
                InventoryItemDetailLifecycleNotice(detail: detail)
                InventoryItemDetailActionRow(
                    actions: actions ?? InventoryItemDetailPrimaryAction.row(for: detail.record),
                    onAction: onAction ?? act)
                sections
            }
            .inventoryMotion(value: detail)
            .padding(.bottom, PopsSpacing.xl)
        }
        .background(Color.popsBackground)
        .ignoresSafeArea(edges: .top)
        .tint(.popsInventory)
        .navigationTitle("")
        .inventoryTitleDisplay(large: false)
        .toolbar {
            InventoryItemDetailToolbar(
                record: detail.record, destroying: $destroying, open: openPending,
                perform: perform, destroy: { Task { await model.destroy() } })
        }
        .navigationDestination(for: InventoryItemHistoryRoute.self) { _ in
            InventoryItemHistoryView(
                name: model.detail?.record.name ?? detail.record.name,
                entries: model.detail?.activity ?? [], isLoading: model.detail == nil,
                onUndo: revert)
        }
        .sheet(item: $quantitySheet) { sheet in
            switch sheet {
            case .split:
                InventorySplitSheet(record: detail.record) { count in
                    Task { await model.split(off: count) }
                }
            case .changeQuantity:
                InventoryChangeQuantitySheet(record: detail.record) { count in
                    Task { await model.changeQuantity(to: count) }
                }
            }
        }
        .sheet(item: $pending) { InventoryItemDetailPendingSheet(pending: $0) }
        .sheet(isPresented: $storing) {
            InventoryStoreHereSheet(
                target: InventoryItemDetailPlacement.storeTarget(for: detail.record),
                runner: model.runner)
        }
        .inventoryPlacementPicker($moving, runner: model.runner) { _ in }
        .inventoryRunnerChrome(model.runner)
        .inventoryUndoCapsule($model.undoOffer) { offer in
            Task { await model.undo(offer) }
        }
    }

    private var sections: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            InventoryItemDetailSyncBanner(
                detail: detail, resolve: { Task { await model.resolveConflict() } },
                retry: refresh)
            InventoryItemDetailContentsSection(
                itemId: detail.record.id, summary: detail.containerSummary)
            capability
            InventoryItemDetailFieldsSection(fields: detail.otherFields)
            InventoryItemDetailProvenanceSection(provenance: detail.provenance)
            InventoryItemDetailDocumentsSection(documents: detail.documents, retry: refresh)
            InventoryItemDetailIdentifiersSection(identifiers: detail.externalIdentifiers)
            InventoryItemDetailNoteSection(note: detail.note)
            InventoryItemDetailHistorySection(
                itemId: detail.record.id, activity: detail.activity, onUndo: revert)
        }
    }

    private func act(_ action: InventoryAction) {
        switch action.id {
        case "move":
            moving = InventoryItemDetailPlacement.moveRequest(for: detail.record)
        case "put-in":
            storing = true
        default:
            Task {
                guard let screen = await model.act(action) else { return }
                openPending(screen)
            }
        }
    }

    /// Routes a pending screen to the real item form when there is one, and
    /// to `InventoryItemDetailPendingSheet`'s placeholder otherwise. Shared
    /// by the action row (`act`) and the toolbar's own Edit button, which
    /// used to call `pending = $0` directly and so kept opening the
    /// placeholder for Edit even after `act` started reaching the real form.
    private func openPending(_ screen: InventoryItemDetailPending) {
        InventoryItemDetailRouting.present(screen, itemId: detail.record.id, itemForm: itemForm) {
            pending = $0
        }
    }

    private func perform(_ command: InventoryLifecycleCommand) {
        switch command {
        case .destroy: destroying = true
        case .split: quantitySheet = .split
        case .changeQuantity: quantitySheet = .changeQuantity
        case .discard, .markLost, .retire, .restore:
            Task { await model.perform(command) }
        }
    }

    private func revert(_ entry: InventoryActivityEntry) {
        Task { await model.revert(entry) }
    }

    private func refresh() {
        Task { await model.refresh() }
    }
}

extension InventoryItemDetailView where Capability == EmptyView {
    internal init(detail: InventoryItemDetail, model: InventoryItemDetailViewModel) {
        self.init(detail: detail, model: model) { EmptyView() }
    }
}
