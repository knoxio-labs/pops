import AppCore
import Foundation

internal enum PurchaseEditMappingError: Error, Hashable, Sendable {
    case missingUpdateToken
    case merchantUnresolved
    case unparseableAmount
    case unparseableDate
    case invalidLine
}

internal enum PurchaseEditMapping {
    internal static func update(
        from draft: ReceiptDraft,
        opened: ReceiptDraft,
        detail: PurchaseDetail
    ) throws -> PurchaseUpdate? {
        let locked = PurchaseEditPolicy.lockedFields(for: detail.purchase.status)
        let originalLineIDs = Set(detail.lines.map(\.id))
        let lines = try updateLines(from: draft, originalLineIDs: originalLineIDs)
        let openedLines = try updateLines(from: opened, originalLineIDs: originalLineIDs)
        let adjustments = try adjustmentTotals(in: draft)
        let openedAdjustments = try adjustmentTotals(in: opened)

        let merchantChanged = merchantIdentity(in: draft) != merchantIdentity(in: opened)
        if merchantChanged, !locked.contains(.merchant), !draft.merchantResolution.isResolved {
            throw PurchaseEditMappingError.merchantUnresolved
        }
        let sendsMerchant = merchantChanged && !locked.contains(.merchant)

        let orderedAt = try changedDate(from: draft, opened: opened, locked: locked)
        let totalCents = try changedTotal(from: draft, opened: opened, locked: locked)

        let subtotal = lines.reduce(0) { $0 + $1.lineTotalCents }
        let openedSubtotal = openedLines.reduce(0) { $0 + $1.lineTotalCents }
        let linesChanged = lines != openedLines
        let hasChanges =
            sendsMerchant || orderedAt != nil || totalCents != nil || linesChanged
            || adjustments != openedAdjustments
        guard hasChanges else { return nil }
        guard let expectedUpdatedAt = detail.updatedAt else {
            throw PurchaseEditMappingError.missingUpdateToken
        }

        return PurchaseUpdate(
            merchantEntityID: sendsMerchant ? draft.merchantResolution.entityID : nil,
            merchantEntityName: sendsMerchant ? draft.merchantResolution.createdValue : nil,
            orderedAt: orderedAt,
            totalCents: totalCents,
            subtotalCents: subtotal != openedSubtotal ? subtotal : nil,
            taxCents: changed(adjustments.tax, from: openedAdjustments.tax),
            shippingCents: changed(adjustments.shipping, from: openedAdjustments.shipping),
            discountCents: changed(adjustments.discount, from: openedAdjustments.discount),
            surchargeCents: changed(adjustments.surcharge, from: openedAdjustments.surcharge),
            lines: lines,
            expectedUpdatedAt: expectedUpdatedAt
        )
    }

    private struct AdjustmentTotals: Equatable {
        var tax = 0
        var shipping = 0
        var discount = 0
        var surcharge = 0
    }

    private static func adjustmentTotals(in draft: ReceiptDraft) throws -> AdjustmentTotals {
        var totals = AdjustmentTotals()
        for adjustment in draft.adjustments where !adjustment.amount.isEmpty {
            let amount = try cents(from: adjustment.amount.value)
            guard amount >= 0 else { throw PurchaseEditMappingError.unparseableAmount }
            switch adjustment.kind {
            case .tax: totals.tax += amount
            case .shipping: totals.shipping += amount
            case .discount: totals.discount += amount
            case .surcharge: totals.surcharge += amount
            }
        }
        return totals
    }

    private static func changedDate(
        from draft: ReceiptDraft,
        opened: ReceiptDraft,
        locked: Set<ReceiptDraftLock.Field>
    ) throws -> Date? {
        guard normalized(draft.date.value) != normalized(opened.date.value),
            !locked.contains(.date)
        else { return nil }
        return try date(from: draft.date.value)
    }

    private static func changedTotal(
        from draft: ReceiptDraft,
        opened: ReceiptDraft,
        locked: Set<ReceiptDraftLock.Field>
    ) throws -> Int? {
        let total = try cents(from: draft.total.value)
        let openedTotal = try cents(from: opened.total.value)
        return total != openedTotal && !locked.contains(.total) ? total : nil
    }

    private static func updateLines(
        from draft: ReceiptDraft, originalLineIDs: Set<String>
    ) throws -> [PurchaseUpdateLine] {
        try draft.lines.filter { !$0.isBlank }.map { line in
            let name = normalized(line.description.value)
            guard !name.isEmpty else { throw PurchaseEditMappingError.invalidLine }
            let amount = try cents(from: line.amount.value)
            let quantity: Int
            if line.quantity.isEmpty {
                quantity = 1
            } else if let parsed = Int(normalized(line.quantity.value)), parsed > 0 {
                quantity = parsed
            } else {
                throw PurchaseEditMappingError.invalidLine
            }
            return PurchaseUpdateLine(
                id: originalLineIDs.contains(line.id) ? line.id : nil,
                name: name,
                quantity: quantity,
                lineTotalCents: amount
            )
        }
    }

    private static func merchantIdentity(in draft: ReceiptDraft) -> String {
        if let id = draft.merchantResolution.entityID { return "id:\(id)" }
        if let name = draft.merchantResolution.createdValue { return "name:\(normalized(name))" }
        return "unresolved"
    }

    private static func cents(from text: String) throws -> Int {
        guard let amount = ReceiptMoneyText.cents(from: text) else {
            throw PurchaseEditMappingError.unparseableAmount
        }
        return amount
    }

    private static func date(from text: String) throws -> Date {
        let pieces = normalized(text).split(separator: "-", omittingEmptySubsequences: false)
        guard pieces.count == 3,
            let year = Int(pieces[0]),
            let month = Int(pieces[1]),
            let day = Int(pieces[2])
        else {
            throw PurchaseEditMappingError.unparseableDate
        }
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = .gmt
        components.year = year
        components.month = month
        components.day = day
        guard let date = components.date,
            components.calendar?.dateComponents([.year, .month, .day], from: date)
                == DateComponents(year: year, month: month, day: day)
        else {
            throw PurchaseEditMappingError.unparseableDate
        }
        return date
    }

    private static func changed(_ value: Int, from opened: Int) -> Int? {
        value == opened ? nil : value
    }

    private static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
