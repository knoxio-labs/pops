import Foundation

/// How a scanned barcode is compared with the external identifiers items
/// carry (a barcode, an ISBN, a serial).
///
/// A person types `978-0-14-103614-4`; a decoder reports `9780141036144`. A
/// camera reads a UPC-A as the EAN-13 with a leading zero, and a person copies
/// the twelve digits printed under the bars. Both sides are reduced to
/// ``matchKey(_:)``, and a scan also tries its other UPC-A/EAN-13 spelling, so
/// one printed code finds the same items however it was entered.
public enum InventoryExternalIdentifierMatch {
    /// Space, tab, line feed and carriage return: the set SQLite's
    /// `TRIM(x, y)` can be handed exactly, so both sides agree.
    public static let trimmed = " \t\n\r"

    /// `value` with ``trimmed`` cut from both ends, without spaces or
    /// hyphens, uppercased. A replica that compares in SQL must reduce stored
    /// values the same way.
    public static func matchKey(_ value: String) -> String {
        value.trimmingCharacters(in: CharacterSet(charactersIn: trimmed))
            .filter { $0 != " " && $0 != "-" }
            .uppercased()
    }

    /// Every key an identifier matching `payload` may reduce to. Empty for a
    /// payload with nothing left once reduced, which matches nothing.
    public static func candidateKeys(for payload: String) -> Set<String> {
        let key = matchKey(payload)
        guard !key.isEmpty else { return [] }
        var keys: Set<String> = [key]
        let isDigits = key.utf8.allSatisfy { (UInt8(ascii: "0")...UInt8(ascii: "9")).contains($0) }
        if isDigits, key.count == 13, key.hasPrefix("0") {
            keys.insert(String(key.dropFirst()))
        }
        if isDigits, key.count == 12 {
            keys.insert("0" + key)
        }
        return keys
    }

    /// Whether any of `identifiers` matches a scanned `payload`.
    public static func matches(
        _ identifiers: [InventoryExternalIdentifier], payload: String
    ) -> Bool {
        let keys = candidateKeys(for: payload)
        return identifiers.contains { keys.contains(matchKey($0.value)) }
    }
}

extension InventoryQuerySource {
    /// Filters the source's whole catalogue. Durable replicas override this
    /// so the comparison runs in SQLite.
    public func inventoryItems(withExternalIdentifier payload: String) -> [InventoryItem] {
        inventoryItems(includeInactive: true)
            .filter {
                !$0.isDeleted
                    && InventoryExternalIdentifierMatch.matches($0.externalIds, payload: payload)
            }
            .sorted {
                let order = $0.name.caseInsensitiveCompare($1.name)
                return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
            }
    }
}
