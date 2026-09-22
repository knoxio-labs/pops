import AppCore
import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// Where an edit sheet opens: ready to type, asking whether to throw changes
/// away, mid-save, or back from a save that failed.
internal enum PurchaseEditStage: String, Identifiable {
    case open
    case confirmingDiscard
    case saving
    case failed

    internal var id: String { rawValue }
}

/// Which fields of a saved purchase can change.
///
/// Once finance has matched a purchase to a bank transaction, the merchant,
/// the date and the total are what the match was made on, so they stay as
/// matched. Everything that describes the purchase rather than identifies it
/// (the lines, the adjustments, the branch) stays editable. A purchase no
/// transaction explains is editable everywhere. A status this build does not
/// know is treated as matched: locking too much is recoverable, and quietly
/// moving a matched total is not.
internal enum PurchaseEditPolicy {
    internal static func lockedFields(for status: PurchaseSettlement)
        -> Set<ReceiptDraftLock.Field>
    {
        switch status {
        case .linked, .partial, .unrecognised: [.merchant, .date, .total]
        case .awaitingSettlement, .settledCash, .ignored: []
        }
    }

    internal static func lock(for status: PurchaseSettlement) -> ReceiptDraftLock? {
        let fields = lockedFields(for: status)
        guard !fields.isEmpty else { return nil }
        let reason =
            if case .unrecognised(let raw) = status {
                "Locked while it reads “\(raw)”"
            } else {
                "Merchant, date and total match the bank"
            }
        return ReceiptDraftLock(fields: fields, reason: reason)
    }
}

/// Editing a saved purchase: the shared receipt form in a sheet, committed
/// from the navigation bar.
///
/// Cancel asks only when something would be lost. A failed save keeps every
/// change and offers Retry. A successful one closes the sheet onto the
/// updated purchase.
internal struct PurchaseEditSheet: View {
    private let detail: PurchaseDetail
    private let opened: ReceiptDraft
    private let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var changed: Bool
    @State private var confirming: Bool
    @State private var saving: Bool
    @State private var failed: Bool

    internal init(
        detail: PurchaseDetail, stage: PurchaseEditStage, onSaved: @escaping () -> Void
    ) {
        self.detail = detail
        self.onSaved = onSaved
        opened = PurchaseEditDraft.draft(for: detail)
        _changed = State(initialValue: stage != .open)
        _confirming = State(initialValue: stage == .confirmingDiscard)
        _saving = State(initialValue: stage == .saving)
        _failed = State(initialValue: stage == .failed)
    }

    internal var body: some View {
        ReceiptDraftView(
            draft: opened,
            complaints: .hintsOnly,
            merchants: PurchaseMerchantFixtures.all,
            lock: PurchaseEditPolicy.lock(for: detail.purchase.status),
            commit: .navigationBar,
            onChange: { changed = $0 != opened },
            isSaving: saving,
            save: { _ in save() }
        )
        .disabled(saving)
        .navigationTitle("Edit purchase")
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { cancel }
        }
        .interactiveDismissDisabled(changed || saving)
        .alert("Couldn't save", isPresented: $failed) {
            Button("Keep editing", role: .cancel) {}
            Button("Retry") { save() }
        } message: {
            Text("No connection. Your changes are still here.")
        }
    }

    private var cancel: some View {
        Button("Cancel") {
            if changed { confirming = true } else { dismiss() }
        }
        .disabled(saving)
        .confirmationDialog(
            "Discard your changes?", isPresented: $confirming, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("The purchase stays as it was.")
        }
    }

    private func save() {
        saving = true
        Task {
            try? await Task.sleep(for: PurchaseDetailTint.beat)
            saving = false
            onSaved()
            dismiss()
        }
    }
}

/// A saved purchase as a form. The saved values go in as the reading, so
/// what the form calls an edit is a change from what is saved now.
internal enum PurchaseEditDraft {
    private static let presentation = ReceiptDraftPresentation()

    internal static func draft(for detail: PurchaseDetail) -> ReceiptDraft {
        let purchase = detail.purchase
        let entityID: String? =
            if case .entity(let id, _, _) = purchase.merchant { id } else { nil }
        let printed: String? =
            switch purchase.merchant {
            case .entity(_, _, let printed), .printed(let printed): printed
            case .unattributed: nil
            }
        let extracted = ExtractedReceipt(
            merchantName: printed,
            address: nil,
            purchasedOn: purchase.orderedOn.formatted(.iso8601.year().month().day()),
            purchasedAt: nil,
            currency: purchase.total.currencyCode,
            total: plain(purchase.total),
            tax: nonZero(detail.tax),
            discounts: [nonZero(detail.discount)].compactMap { $0 },
            surcharges: [nonZero(detail.surcharge)].compactMap { $0 },
            shipping: nonZero(detail.shipping),
            lines: detail.lines.map {
                ExtractedReceiptLine(
                    description: PurchaseDetailLineText.oneLine($0.name),
                    amount: plain($0.lineTotal),
                    quantity: $0.quantity > 1 ? $0.quantity : nil,
                    unitNote: nil,
                    listAmount: nil)
            },
            unreadableNotes: [],
            // A saved purchase's adjustments sit on top of its lines: the
            // detail's lines and adjustments add up to its total.
            taxIncluded: false,
            discountIncluded: false,
            surchargeIncluded: false,
            shippingIncluded: false
        )
        return presentation.draft(extracted: extracted, failures: [], matchedMerchantID: entityID)
    }

    internal static func plain(_ amount: MoneyAmount) -> String {
        let units = abs(amount.minorUnits)
        let cents = units % 100
        return "\(units / 100).\(cents < 10 ? "0" : "")\(cents)"
    }

    private static func nonZero(_ amount: MoneyAmount) -> String? {
        amount.minorUnits == 0 ? nil : plain(amount)
    }
}

/// What a person replaced, beside what it says now.
internal struct PurchaseOriginalSheet: View {
    internal let edit: PurchaseEdit
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List(edit.changes) { change in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(change.field)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(change.original)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .strikethrough()
                    Text(change.current)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    "\(change.field): was \(change.original), now \(change.current)")
            }
            .navigationTitle("As read")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .tint(PurchaseDetailTint.color)
    }
}
