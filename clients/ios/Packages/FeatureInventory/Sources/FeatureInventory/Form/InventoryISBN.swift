import Foundation

internal enum InventoryISBN {
    internal static func normalised(_ raw: String) -> String? {
        let compact = raw.filter { !$0.isWhitespace && $0 != "-" }
        let bytes = Array(compact.utf8)

        switch bytes.count {
        case 10:
            return normalisedISBN10(compact: compact, bytes: bytes)
        case 13:
            return validISBN13(compact: compact, bytes: bytes) ? compact : nil
        default:
            return nil
        }
    }

    private static func normalisedISBN10(compact: String, bytes: [UInt8]) -> String? {
        guard
            bytes.prefix(9).allSatisfy(isDigit),
            isDigit(bytes[9]) || bytes[9] == ASCII.uppercaseX
        else { return nil }

        var sum = 0
        for (index, byte) in bytes.enumerated() {
            let value = byte == ASCII.uppercaseX ? 10 : Int(byte - ASCII.zero)
            sum += value * (10 - index)
        }
        guard sum.isMultiple(of: 11) else { return nil }

        let body = String(compact.prefix(9))
        let eanBody = "978\(body)"
        return eanBody + String(checkDigit(for: eanBody))
    }

    private static func validISBN13(compact: String, bytes: [UInt8]) -> Bool {
        guard
            bytes.allSatisfy(isDigit),
            bytes[0] == ASCII.nine,
            bytes[1] == ASCII.seven,
            bytes[2] == ASCII.eight || bytes[2] == ASCII.nine
        else { return false }

        let body = String(compact.dropLast())
        let check = Int(bytes[12] - ASCII.zero)
        return checkDigit(for: body) == check
    }

    private static func checkDigit(for body: String) -> Int {
        let bytes = Array(body.utf8)
        let weightedSum = bytes.enumerated().reduce(0) { sum, element in
            let weight = element.offset.isMultiple(of: 2) ? 1 : 3
            return sum + Int(element.element - ASCII.zero) * weight
        }
        return (10 - weightedSum % 10) % 10
    }

    private static func isDigit(_ byte: UInt8) -> Bool {
        byte >= ASCII.zero && byte <= ASCII.nine
    }

    private enum ASCII {
        static let zero: UInt8 = 48
        static let seven: UInt8 = 55
        static let eight: UInt8 = 56
        static let nine: UInt8 = 57
        static let uppercaseX: UInt8 = 88
    }
}
