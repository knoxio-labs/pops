import Foundation

/// Cents, as plain decimal text and back — the one seam where this app turns
/// a number into something a form can hold and back again (POPS-2454).
///
/// The BFM's receipt-draft contract is cents throughout; a `TextField` holds
/// a `String`. ``string(fromCents:)`` is what the repository shows a reader
/// before they have touched anything, and ``cents(from:)`` is what a save
/// reads back — deliberately locale-invariant on both ends, so the same
/// digits round-trip whatever the device's region is set to: a device set to
/// a comma-decimal locale must not have its own reading of "12.50" disagree
/// with what was shown.
public enum ReceiptMoneyText {
    /// `1250` → `"12.50"`, `-240` → `"-2.40"`, `5` → `"0.05"`.
    public static func string(fromCents cents: Int) -> String {
        let sign = cents < 0 ? "-" : ""
        let magnitude = abs(cents)
        return "\(sign)\(magnitude / 100).\(String(format: "%02d", magnitude % 100))"
    }

    /// The reverse, or `nil` when `text` is not a plain decimal amount.
    ///
    /// Accepts an optional leading `-` sign, up to two fraction digits, and
    /// nothing else — no currency symbol, no thousands separator, no
    /// trailing garbage. A reader typing `$12.50` or `1,234` has typed
    /// something this deliberately refuses rather than guesses at, because a
    /// guess that lands on the wrong number is a purchase amount silently
    /// wrong.
    public static func cents(from text: String) -> Int? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard
            let match = trimmed.range(
                of: #"^-?\d+(\.\d{1,2})?$"#, options: .regularExpression)
        else {
            return nil
        }
        guard match == trimmed.startIndex..<trimmed.endIndex else { return nil }

        let isNegative = trimmed.hasPrefix("-")
        let unsigned = isNegative ? String(trimmed.dropFirst()) : trimmed
        let parts = unsigned.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let wholePart = parts.first, let whole = Int(wholePart) else { return nil }
        let fractionText = parts.count > 1 ? String(parts[1]) : ""
        let paddedFraction = fractionText.padding(toLength: 2, withPad: "0", startingAt: 0)
        guard let fraction = Int(paddedFraction.isEmpty ? "0" : paddedFraction) else { return nil }

        let magnitude = whole * 100 + fraction
        return isNegative ? -magnitude : magnitude
    }
}
