import AppCore
import Foundation

internal enum PurchaseEditDraft {
    internal static func draft(for detail: PurchaseDetail) -> ReceiptDraft {
        let purchase = detail.purchase
        let merchant: (printed: String?, resolution: RecordResolution) =
            switch purchase.merchant {
            case .entity(let id, _, let printed): (printed, .matched(id: id))
            case .printed(let printed): (printed, .unresolved)
            case .unattributed: (nil, .unresolved)
            }

        return ReceiptDraft(
            printedMerchant: ReceiptDraftValue(extracted: merchant.printed),
            merchantResolution: merchant.resolution,
            printedAddress: ReceiptDraftValue(extracted: nil),
            date: ReceiptDraftValue(extracted: day(purchase.orderedOn)),
            lines: detail.lines.map {
                ReceiptDraftLine(
                    id: $0.id,
                    description: ReceiptDraftValue(
                        extracted: PurchaseDetailLineText.oneLine($0.name)),
                    amount: ReceiptDraftValue(extracted: signed($0.lineTotal)),
                    quantity: ReceiptDraftValue(
                        extracted: $0.quantity > 1 ? String($0.quantity) : nil),
                    unitNote: ReceiptDraftValue(extracted: nil)
                )
            },
            adjustments: adjustments(for: detail),
            total: ReceiptDraftValue(extracted: magnitude(purchase.total)),
            currency: purchase.total.currencyCode
        )
    }

    internal static func signed(_ amount: MoneyAmount) -> String {
        ReceiptMoneyText.string(fromCents: amount.minorUnits)
    }

    internal static func magnitude(_ amount: MoneyAmount) -> String {
        ReceiptMoneyText.string(fromCents: abs(amount.minorUnits))
    }

    internal static func day(
        _ date: Date, timeZone: TimeZone = .autoupdatingCurrent
    ) -> String {
        Date.ISO8601FormatStyle(dateSeparator: .dash, timeZone: timeZone)
            .year()
            .month()
            .day()
            .format(date)
    }

    private static func adjustments(for detail: PurchaseDetail) -> [ReceiptDraftAdjustment] {
        [
            adjustment(id: "tax", kind: .tax, amount: detail.tax),
            adjustment(id: "discount", kind: .discount, amount: detail.discount),
            adjustment(id: "surcharge", kind: .surcharge, amount: detail.surcharge),
            adjustment(id: "shipping", kind: .shipping, amount: detail.shipping),
        ].compactMap { $0 }
    }

    private static func adjustment(
        id: String, kind: ReceiptDraftAdjustment.Kind, amount: MoneyAmount
    ) -> ReceiptDraftAdjustment? {
        guard amount.minorUnits != 0 else { return nil }
        return ReceiptDraftAdjustment(
            id: id, kind: kind, amount: ReceiptDraftValue(extracted: magnitude(amount)))
    }
}
