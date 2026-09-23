import AppCore
import DesignSystem
import SwiftUI

extension PurchaseReviewCopy {
    internal static let cancel = "Cancel"
    internal static let discard = "Discard"
    internal static let keepChecking = "Keep checking"
    internal static let keepPurchase = "Keep it"
    internal static let discardPurchase = "Discard this purchase?"
    internal static let receiptRemainsStored = "The receipt stays stored."

    internal static func title(position: Int, total: Int) -> String {
        total <= 1 ? "Review" : "\(min(max(position, 1), total)) of \(total)"
    }

    internal static func subtitle(saving: ReviewSaving, written: Int, total: Int) -> String {
        if case .saving(let done) = saving {
            return "Saving \(min(done + 1, total)) of \(total)"
        }
        return written > 0 ? ReviewSaving.saved(written) : ""
    }

    internal static func cancelTitle(count: Int) -> String {
        count == 1 ? discardPurchase : "Discard all \(count) purchases?"
    }

    internal static func cancelMessage(saved: Int) -> String {
        saved == 0 ? "Nothing is saved yet." : ReviewSaving.alreadySaved(saved)
    }
}

extension PurchaseReviewViewModel {
    internal var finishedIDs: [Purchase.ID]? {
        remaining.isEmpty ? savedPurchaseIDs : nil
    }
}

internal struct PurchaseReviewControls: View {
    internal let position: Int
    internal let total: Int
    internal let toCheck: Int
    internal let isSaving: Bool
    internal let onPrevious: () -> Void
    internal let onNext: () -> Void
    internal let onCheck: () -> Void
    internal let onDiscard: () -> Void

    @State private var confirmingDiscard = false

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            if total > 1 {
                step("chevron.left", previous: true, action: onPrevious)
                step("chevron.right", previous: false, action: onNext)
            }
            Spacer()
            if toCheck > 0, !isSaving {
                Button(action: onCheck) {
                    HStack(spacing: PopsSpacing.xs) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color.popsWarning)
                        Text("\(toCheck) to check")
                            .foregroundStyle(Color.popsForeground)
                    }
                    .padding(.horizontal, PopsSpacing.sm)
                }
            }
            Spacer()
            Button(
                role: .destructive,
                action: { confirmingDiscard = true },
                label: { Image(systemName: "trash") }
            )
            .disabled(total == 0 || isSaving)
            .accessibilityLabel(PurchaseReviewCopy.discardPurchase)
            .confirmationDialog(
                PurchaseReviewCopy.discardPurchase,
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button(PurchaseReviewCopy.discard, role: .destructive, action: onDiscard)
                Button(PurchaseReviewCopy.keepPurchase, role: .cancel) {}
            } message: {
                Text(PurchaseReviewCopy.receiptRemainsStored)
            }
        }
    }

    private func step(_ symbol: String, previous: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol) }
            .disabled(isSaving || (previous ? position == 1 : position == total))
            .accessibilityLabel(previous ? "Previous purchase" : "Next purchase")
    }
}
