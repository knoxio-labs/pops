import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseReviewView: View {
    private let model: PurchaseReviewViewModel
    private let merchants: [ReceiptMerchantChoice]
    private let onCancel: () -> Void
    private let onFinished: ([Purchase.ID]) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index = 0
    @State private var forward = true
    @State private var confirmingCancel = false
    @State private var didFinish = false

    internal init(
        model: PurchaseReviewViewModel,
        merchants: [ReceiptMerchantChoice],
        onCancel: @escaping () -> Void,
        onFinished: @escaping ([Purchase.ID]) -> Void
    ) {
        self.model = model
        self.merchants = merchants
        self.onCancel = onCancel
        self.onFinished = onFinished
    }

    internal var body: some View {
        ZStack {
            if let current {
                form(current)
                    .transition(pageTransition)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) { saveInset }
        .navigationTitle(PurchaseReviewCopy.title(position: position, total: remaining.count))
        .navigationSubtitle(
            PurchaseReviewCopy.subtitle(
                saving: model.saving,
                written: model.written,
                total: model.written + remaining.count)
        )
        .popsTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { cancelButton }
            ToolbarItem(placement: .confirmationAction) { saveButton }
        }
        .popsBottomBar { controls }
        .popsMotion(value: model.saving)
        .popsMotion(value: current?.id)
        .onAppear {
            markSeen()
            finishIfNeeded(model.finishedIDs)
        }
        .onChange(of: current?.id) {
            markSeen()
        }
        .onChange(of: model.finishedIDs) { _, ids in
            finishIfNeeded(ids)
        }
        .tint(.popsPurchases)
    }

    private var remaining: [ReviewEntry] { model.remaining }

    private var current: ReviewEntry? {
        remaining.indices.contains(index) ? remaining[index] : remaining.last
    }

    private var position: Int {
        min(index, max(remaining.count - 1, 0)) + 1
    }

    private var pageTransition: AnyTransition {
        reduceMotion ? .opacity : .push(from: forward ? .trailing : .leading)
    }

    private func form(_ entry: ReviewEntry) -> some View {
        ReceiptDraftView(
            draft: Binding(
                get: { model.drafts[entry.id] ?? entry.draft },
                set: { model.edit(entry.id, draft: $0) }),
            subtitle: entry.origin == .unreadable ? PurchaseReviewCopy.unreadableSubtitle : nil,
            status: entry.status,
            complaints: .hintsOnly,
            merchants: merchants,
            parts: entry.parts
        )
        .id(entry.id)
        .disabled(model.saving.isInFlight)
    }

    @ViewBuilder private var saveInset: some View {
        if case .saving(let done) = model.saving {
            PurchaseSaveProgress(done: done, total: model.written + remaining.count)
        } else if let current, let reason = model.saving.notice(for: current.id) {
            PurchaseSaveNotice(reason: reason)
        }
    }

    private var cancelButton: some View {
        Button(PurchaseReviewCopy.cancel) { confirmingCancel = true }
            .disabled(model.saving.isInFlight)
            .confirmationDialog(
                PurchaseReviewCopy.cancelTitle(count: remaining.count),
                isPresented: $confirmingCancel,
                titleVisibility: .visible
            ) {
                Button(PurchaseReviewCopy.discard, role: .destructive, action: onCancel)
                Button(PurchaseReviewCopy.keepChecking, role: .cancel) {}
            } message: {
                Text(PurchaseReviewCopy.cancelMessage(saved: model.written))
            }
    }

    private var saveButton: some View {
        Button(model.saving.saveTitle(count: remaining.count)) {
            Task {
                await model.save()
                finishIfNeeded(model.finishedIDs)
            }
        }
        .popsProminentGlassButton()
        .disabled(
            remaining.isEmpty || model.toCheck > 0 || model.saving.blocksSave
                || model.saving.isInFlight)
    }

    private var controls: some View {
        PurchaseReviewControls(
            position: position,
            total: remaining.count,
            toCheck: model.toCheck,
            isSaving: model.saving.isInFlight,
            onPrevious: { move(to: index - 1) },
            onNext: { move(to: index + 1) },
            onCheck: moveToFirstHold,
            onDiscard: discardCurrent)
    }

    private func move(to target: Int) {
        let bounded = min(max(target, 0), max(remaining.count - 1, 0))
        forward = bounded > index
        index = bounded
    }

    private func moveToFirstHold() {
        guard let held = model.holding.first,
            let target = remaining.firstIndex(where: { $0.id == held })
        else { return }
        move(to: target)
    }

    private func discardCurrent() {
        guard let current else { return }
        forward = true
        model.discard(current.id)
        index = min(index, max(remaining.count - 1, 0))
        finishIfNeeded(model.finishedIDs)
    }

    private func markSeen() {
        guard let current else { return }
        model.markSeen(current.id)
    }

    private func finishIfNeeded(_ ids: [Purchase.ID]?) {
        guard !didFinish, let ids else { return }
        didFinish = true
        onFinished(ids)
    }
}
