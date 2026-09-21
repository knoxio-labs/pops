import AppCore
import DesignSystem
import SwiftUI

/// A saved purchase on screen: who and what it came to, where it stands
/// against the bank, and the receipt's lines with their totals.
///
/// Laid out after Inventory's item detail and made to fit one phone screen.
/// Everything above the lines is fixed; the lines are the one list, and the
/// only thing that scrolls. Edit and Share sit in the navigation bar, as
/// Inventory's Edit and More do.
internal struct PurchaseDetailPage: View {
    @State private var detail: PurchaseDetail
    @State private var refresh: PurchaseDetailFailure?
    @State private var editing: PurchaseEditStage?
    @State private var showsOriginal: Bool
    @State private var viewing: StagedPage?
    private let afterSave: PurchaseDetail?

    internal init(
        detail: PurchaseDetail, refresh: PurchaseDetailFailure?, stage: PurchaseDetailStage
    ) {
        _detail = State(initialValue: detail)
        _refresh = State(initialValue: refresh)
        _editing = State(initialValue: stage.edit)
        _showsOriginal = State(initialValue: stage.showsOriginal)
        afterSave = stage.afterSave
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PurchaseDetailHeader(detail: detail) { viewing = $0 }
            notices
            PurchaseDetailMatchRow(status: detail.purchase.status)
            PurchaseDetailReceipt(detail: detail)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .padding(.bottom, PopsSpacing.lg)
        .inventoryMotion(value: detail)
        .inventoryMotion(value: refresh)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.popsBackground)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { editing = .open }
            }
            ToolbarItem(placement: .primaryAction) {
                ShareLink(item: PurchaseDetailCopy.shareText(detail)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .sheet(item: $editing) { stage in
            NavigationStack {
                PurchaseEditSheet(detail: detail, stage: stage) { saved() }
            }
            .tint(PurchaseDetailTint.color)
        }
        .sheet(isPresented: $showsOriginal) {
            if let edit = detail.edit { PurchaseOriginalSheet(edit: edit) }
        }
        .playgroundStage(item: $viewing) { page in
            PurchasePageViewer(
                staged: StagedReceipts([StagedReceipt(id: detail.id, pages: detail.pages)]),
                showing: page,
                onDelete: { _ in }
            )
        }
    }

    @ViewBuilder private var notices: some View {
        if let refresh {
            InventoryItemDetailNotice(
                symbol: PurchaseDetailCopy.symbol(for: refresh),
                tint: .popsWarning,
                text: PurchaseDetailCopy.refreshNotice(for: refresh)
            ) {
                Button {
                    self.refresh = nil
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Retry")
            }
        }
        if let edit = detail.edit {
            InventoryItemDetailNotice(
                symbol: "pencil",
                tint: PurchaseDetailTint.color,
                text: PurchaseDetailCopy.edited(edit.editedOn)
            ) {
                if !edit.changes.isEmpty {
                    Button("Original") { showsOriginal = true }
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            }
        }
    }

    /// The purchase as the save left it. A staged save lands on a prepared
    /// fixture; the form keeps its values to itself.
    private func saved() {
        detail =
            afterSave
            ?? PurchaseDetail(
                purchase: detail.purchase, subtotal: detail.subtotal, tax: detail.tax,
                shipping: detail.shipping, discount: detail.discount,
                surcharge: detail.surcharge, source: detail.source, lines: detail.lines,
                pages: detail.pages, edit: PurchaseEdit(editedOn: .now, changes: []))
    }
}
