import AppCore

internal enum PurchaseEditPolicy {
    internal static func canSave(_ draft: ReceiptDraft, opened: ReceiptDraft) -> Bool {
        draft.problems.allSatisfy { problem in
            problem == .merchantUnresolved
                && draft.merchantResolution == opened.merchantResolution
        }
    }

    internal static func lockedFields(
        for status: PurchaseSettlement
    ) -> Set<ReceiptDraftLock.Field> {
        switch status {
        case .awaitingSettlement, .settledCash, .ignored: []
        case .linked, .partial, .unrecognised: [.merchant, .date, .total]
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

    internal static func unlinkNotice(for line: PurchaseDetailLine) -> String? {
        line.hasInventoryLink ? "Removing this unlinks it from Inventory" : nil
    }
}
