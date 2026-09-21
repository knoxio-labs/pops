import AppCore
import DesignSystem
import SwiftUI

/// A saved purchase on screen: who, what it came to, the paper, and the lines.
///
/// Laid out after Inventory's item detail and made to fit one phone screen.
/// The receipt sits beside the identity rather than above it, because a till
/// receipt is a tall narrow strip and a full-width banner of one is mostly
/// crop. Everything above the lines is fixed; the lines are the one list,
/// and the only thing that scrolls.
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
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                PurchaseDetailHeader(detail: detail) { viewing = $0 }
                PurchaseDetailFigures(detail: detail)
                notices
                PurchaseDetailItemsHeader(count: detail.lines.count)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.sm)
            PurchaseDetailLines(lines: detail.lines)
        }
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
            PurchaseDetailNotice(
                symbol: PurchaseDetailCopy.symbol(for: refresh),
                tint: .popsWarning,
                text: PurchaseDetailCopy.refreshNotice(for: refresh)
            ) {
                Button("Retry") { self.refresh = nil }
                    .font(.popsSubheadline.weight(.semibold))
            }
            .transition(.opacity)
        }
        if let edit = detail.edit {
            PurchaseDetailNotice(
                symbol: "pencil",
                tint: PurchaseDetailTint.color,
                text: PurchaseDetailCopy.edited(edit.editedOn)
            ) {
                if !edit.changes.isEmpty {
                    Button("Original") { showsOriginal = true }
                        .font(.popsSubheadline.weight(.semibold))
                }
            }
            .transition(.opacity)
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

/// One line saying something about the record, led by its glyph, with room at
/// the end for the one thing to do about it.
internal struct PurchaseDetailNotice<Action: View>: View {
    internal let symbol: String
    internal let tint: Color
    internal let text: String
    @ViewBuilder internal let action: Action

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: symbol)
                .font(.popsSubheadline)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
            Spacer(minLength: PopsSpacing.sm)
            action
        }
        .frame(minHeight: PopsSize.touchTarget)
    }
}

/// `Items` and how many, over the list.
internal struct PurchaseDetailItemsHeader: View {
    internal let count: Int

    internal var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Items")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            Text("\(count)")
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
                .contentTransition(.numericText())
        }
    }
}
