import AppCore
import DesignSystem
import Foundation
import SwiftUI

@MainActor
internal enum PurchasesPresentation {
    internal static func merchant(_ purchase: Purchase) -> String {
        purchase.merchant.displayName ?? "Merchant not recognised"
    }

    internal static func isUnattributed(_ purchase: Purchase) -> Bool {
        purchase.merchant == .unattributed
    }

    internal static func day(_ purchase: Purchase) -> String {
        day(of: purchase.orderedOn)
    }

    nonisolated internal static func day(of date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    internal static func month(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year())
    }

    internal static func shortMonth(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated))
    }

    internal static func label(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "Unmatched"
        case .linked: "Matched"
        case .partial: "Part matched"
        case .settledCash: "Cash"
        case .ignored: "Ignored"
        case .unrecognised(let raw): raw
        }
    }

    internal static func tone(for status: PurchaseSettlement) -> Color {
        switch status {
        case .awaitingSettlement, .partial: Color.popsWarning
        case .linked, .settledCash: Color.popsSuccess
        case .ignored, .unrecognised: Color.popsMutedForeground
        }
    }

    internal static func byMonth(
        _ purchases: [Purchase]
    ) -> [(month: Date, purchases: [Purchase])] {
        let calendar = Calendar.current
        var grouped: [Date: [Purchase]] = [:]
        for purchase in purchases {
            let components = calendar.dateComponents([.year, .month], from: purchase.orderedOn)
            let key = calendar.date(from: components) ?? purchase.orderedOn
            grouped[key, default: []].append(purchase)
        }
        return grouped.keys.sorted(by: >).map { month in
            (month: month, purchases: grouped[month] ?? [])
        }
    }

    internal static func totals(_ purchases: [Purchase]) -> [MoneyAmount] {
        var byCurrency: [String: Int] = [:]
        for purchase in purchases {
            byCurrency[purchase.total.currencyCode, default: 0] += purchase.total.minorUnits
        }
        return
            byCurrency
            .map { MoneyAmount(minorUnits: $0.value, currencyCode: $0.key) }
            .sorted {
                if $0.minorUnits != $1.minorUnits { return $0.minorUnits > $1.minorUnits }
                return $0.currencyCode < $1.currencyCode
            }
    }

    internal static func delta(
        for month: Date,
        in months: [(month: Date, purchases: [Purchase])],
        currency: String
    ) -> (amount: MoneyAmount, isUp: Bool)? {
        guard let index = months.firstIndex(where: { $0.month == month }),
            months.indices.contains(index + 1)
        else { return nil }
        let current = total(months[index].purchases, in: currency)
        let previous = total(months[index + 1].purchases, in: currency)
        guard previous != 0 else { return nil }
        return (
            amount: MoneyAmount(minorUnits: abs(current - previous), currencyCode: currency),
            isUp: current > previous
        )
    }

    internal static func total(_ purchases: [Purchase], in currency: String) -> Int {
        purchases
            .filter { $0.total.currencyCode == currency }
            .reduce(0) { $0 + $1.total.minorUnits }
    }
}
