import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailScreen: View {
    internal let dependencies: AppDependencies
    @State private var model: PurchaseDetailViewModel
    @Environment(\.errorPresenter) private var errorPresenter

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
                    .accessibilityIdentifier(PurchaseDetailAccessibility.root)
            case .loaded(let detail, let refresh):
                PurchaseDetailPage(
                    detail: detail,
                    refresh: refresh,
                    model: model,
                    dependencies: dependencies
                )
                .accessibilityIdentifier(PurchaseDetailAccessibility.root)
            case .failed(let failure):
                PurchaseDetailFailureView(failure: failure) {
                    Task { await model.retry() }
                }
                .accessibilityIdentifier(PurchaseDetailAccessibility.root)
            }
        }
        .transition(.opacity)
        .popsMotion(PopsMotion.smooth, value: model.phase)
        .tint(.popsPurchases)
        .task { await model.load() }
        .onChange(of: refreshFailure) { _, failure in
            guard let failure else { return }
            errorPresenter.present(
                failure.popsError,
                operation: "Refresh purchase details",
                context: .foreground)
        }
    }

    private var refreshFailure: PurchaseDetailFailure? {
        guard case .loaded(_, let failure) = model.phase else { return nil }
        return failure
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
            PurchaseDetailHeader(
                detail: detail,
                receiptPages: model.receiptPages,
                isLoadingReceiptThumbnail: model.receiptThumbnailState == .loading
            ) { index in
                viewing = PurchaseReceiptSelection(index: index)
                Task { await model.openReceipt(at: index) }
            }
            notices
            PurchaseBankMatchSection(
                status: detail.purchase.status, accounting: detail.accounting,
                charges: detail.charges)
            PurchaseDetailReceipt(detail: detail)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .padding(.bottom, PopsSpacing.lg)
        .popsMotion(PopsMotion.smooth, value: detail)
        .popsMotion(PopsMotion.smooth, value: refresh)
        .popsMotion(value: model.receiptThumbnailState)
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
        if let edit = detail.edit {
            PurchaseDetailEditedNotice(edit: edit) { showsOriginal = true }
        }
    }
}
