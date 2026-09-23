import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailScreen: View {
    internal let dependencies: AppDependencies
    @State private var model: PurchaseDetailViewModel

    internal init(id: Purchase.ID, dependencies: AppDependencies) {
        self.dependencies = dependencies
        _model = State(
            initialValue: PurchaseDetailViewModel(id: id, dependencies: dependencies))
    }

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                PurchaseDetailSkeleton()
            case .loaded(let detail, let refresh):
                PurchaseDetailPage(
                    detail: detail,
                    refresh: refresh,
                    model: model,
                    dependencies: dependencies)
            case .failed(let failure):
                PurchaseDetailFailureView(failure: failure) {
                    Task { await model.retry() }
                }
            }
        }
        .transition(.opacity)
        .popsMotion(PopsMotion.smooth, value: model.phase)
        .tint(.popsPurchases)
        .accessibilityIdentifier(PurchaseDetailAccessibility.root)
        .task { await model.load() }
    }
}

internal struct PurchaseDetailPage: View {
    internal let detail: PurchaseDetail
    internal let refresh: PurchaseDetailFailure?
    internal let model: PurchaseDetailViewModel
    internal let dependencies: AppDependencies

    @State private var editing = false
    @State private var showsOriginal = false
    @State private var viewing: PurchaseReceiptSelection?

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PurchaseDetailHeader(detail: detail, receiptPages: model.receiptPages) { index in
                viewing = PurchaseReceiptSelection(index: index)
                Task { await model.openReceipt(at: index) }
            }
            notices
            PurchaseDetailMatchRow(status: detail.purchase.status)
            PurchaseDetailReceipt(detail: detail)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .padding(.bottom, PopsSpacing.lg)
        .popsMotion(PopsMotion.smooth, value: detail)
        .popsMotion(PopsMotion.smooth, value: refresh)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.popsBackground)
        .navigationTitle("")
        .popsTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { editing = true }
                    .accessibilityIdentifier(PurchaseDetailAccessibility.edit)
            }
            ToolbarItem(placement: .primaryAction) {
                ShareLink(item: PurchaseDetailCopy.shareText(detail)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier(PurchaseDetailAccessibility.share)
            }
        }
        .sheet(isPresented: $editing) {
            NavigationStack {
                PurchaseEditSheet(
                    request: PurchaseEditRequest(detail: detail) { saved in
                        model.applySaved(saved)
                    },
                    dependencies: dependencies)
            }
            .tint(.popsPurchases)
        }
        .sheet(isPresented: $showsOriginal) {
            if let edit = detail.edit {
                PurchaseOriginalSheet(edit: edit, lines: detail.lines)
            }
        }
        .popsStage(item: $viewing) { selection in
            PurchaseReceiptViewer(
                detail: detail,
                initialIndex: selection.index,
                model: model)
        }
    }

    @ViewBuilder private var notices: some View {
        if let refresh {
            PopsNotice(
                symbol: PurchaseDetailCopy.symbol(for: refresh),
                tint: .popsWarning,
                text: PurchaseDetailCopy.refreshNotice(for: refresh)
            ) {
                Button {
                    Task { await model.refresh() }
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
            PurchaseDetailEditedNotice(edit: edit) { showsOriginal = true }
        }
    }
}
