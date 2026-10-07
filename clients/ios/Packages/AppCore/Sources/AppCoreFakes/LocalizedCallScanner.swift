/// Reads the string literal out of every `localized(…)` call in a Swift source.
///
/// Not a Swift parser. It understands the two shapes the copy enums use, a
/// single-line literal and a multi-line one, and counts anything else as
/// unreadable rather than skipping it, so a call written a third way fails the
/// audit instead of escaping it.
internal struct LocalizedCallScanner {
    /// What an interpolation becomes in a key.
    internal static let argument = "\u{1}"

    internal private(set) var keys: Set<String> = []
    internal private(set) var unreadable = 0

    internal init(source: String) {
        var rest = source[...]
        while let call = rest.firstRange(of: "localized(") {
            let isWholeName =
                call.lowerBound == source.startIndex
                || !Self.continuesAnIdentifier(source[source.index(before: call.lowerBound)])
            rest = rest[call.upperBound...]
            guard isWholeName else { continue }
            rest = rest.drop(while: \.isWhitespace)
            if rest.hasPrefix("\"\"\"") {
                record(Self.multiLineBody(&rest))
            } else if rest.hasPrefix("\"") {
                rest = rest.dropFirst()
                record(Self.key(consuming: &rest, until: "\""))
            } else {
                unreadable += 1
            }
        }
    }

    private static func continuesAnIdentifier(_ character: Character) -> Bool {
        character.isLetter || character.isNumber || character == "_"
    }

    private mutating func record(_ key: String?) {
        if let key { keys.insert(key) } else { unreadable += 1 }
    }

    /// The literal's text with each `\(…)` replaced by ``argument`` and each
    /// `%` doubled, which is how the catalogue spells both.
    private static func key(consuming rest: inout Substring, until terminator: Character?)
        -> String?
    {
        var key = ""
        while let character = rest.first {
            rest = rest.dropFirst()
            switch character {
            case terminator: return key
            case "%": key += "%%"
            case "\\":
                guard rest.first == "(" else { return nil }
                guard skipInterpolation(&rest) else { return nil }
                key += argument
            default: key.append(character)
            }
        }
        return terminator == nil ? key : nil
    }

    private static func skipInterpolation(_ rest: inout Substring) -> Bool {
        var depth = 0
        while let character = rest.first {
            rest = rest.dropFirst()
            if character == "(" { depth += 1 }
            if character == ")" { depth -= 1 }
            if depth == 0 { return true }
        }
        return false
    }

    private static func multiLineBody(_ rest: inout Substring) -> String? {
        rest = rest.dropFirst(3)
        guard let close = rest.firstRange(of: "\"\"\"") else { return nil }
        let lines = rest[..<close.lowerBound].split(
            separator: "\n", omittingEmptySubsequences: true)
        rest = rest[close.upperBound...]

        var joined = ""
        for line in lines.dropLast() {
            let text = line.drop(while: \.isWhitespace)
            if text.hasSuffix("\\") {
                joined += text.dropLast()
            } else {
                joined += text + "\n"
            }
        }
        if joined.hasSuffix("\n") { joined.removeLast() }
        var body = joined[...]
        return key(consuming: &body, until: nil)
    }
}
