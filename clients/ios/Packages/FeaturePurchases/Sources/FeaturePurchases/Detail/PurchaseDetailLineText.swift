import AppCore
import Foundation

internal enum PurchaseDetailLineText {
    internal static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }

    internal static func quantity(_ line: PurchaseDetailLine) -> String? {
        guard line.quantity > 1 else { return nil }
        let total = line.lineTotal.minorUnits
        guard total % line.quantity == 0 else { return "Qty \(line.quantity)" }
        let unit = MoneyAmount(
            minorUnits: total / line.quantity, currencyCode: line.lineTotal.currencyCode)
        return "\(line.quantity) × \(unit.formatted())"
    }
}
