import Foundation

/// Scans Swift source for the two things this package exists to make
/// impossible: a colour that is not a token, and a metric that is not a step on
/// the scale. It is a text scan rather than a compiler check because Swift has
/// no way to withdraw `Color.red` from a module that imports SwiftUI.
enum TokenDisciplineScanner {
    struct Rule {
        let name: String
        let pattern: String
    }

    struct Violation: CustomStringConvertible {
        let file: String
        let line: Int
        let rule: String
        let snippet: String

        var description: String { "\(file):\(line): \(rule) — \(snippet)" }
    }

    static let rules: [Rule] = [
        Rule(name: "hex colour literal",
             pattern: #"#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![0-9A-Za-z_])"#),
        Rule(name: "system colour",
             pattern: #"\.(?:red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|white|gray|grey|black|clear|primary|secondary|accentColor)(?![0-9A-Za-z_])"#),
        Rule(name: "raw colour construction",
             pattern: #"\b(?:UIColor|NSColor|CGColor)\b|\bColor\(\s*(?:\.sRGB|red\s*:|hue\s*:|white\s*:|cgColor\s*:)"#),
        Rule(name: "numeric metric literal",
             pattern: #"\.padding\(\s*-?\d|\.padding\(\s*\.\w+\s*,\s*-?\d|\bspacing\s*:\s*-?\d|\bcornerRadius\s*:\s*-?\d|\.cornerRadius\(\s*-?\d|\blineWidth\s*:\s*-?\d|\.frame\(\s*(?:width|height|minWidth|maxWidth|minHeight|maxHeight|idealWidth|idealHeight)\s*:\s*-?\d"#),
        Rule(name: "fixed font size",
             pattern: #"\.system\(\s*size\s*:|\bFont\.custom\("#),
    ]

    /// Swift `Regex` defaults to Unicode word boundaries, under which
    /// `UIColor.systemBackground` is one word and `\bUIColor\b` never matches
    /// it. Lookbehind — the obvious alternative — is unimplemented, so the
    /// boundary kind is what has to change.
    private static func compile(_ pattern: String) throws -> Regex<AnyRegexOutput> {
        try Regex(pattern).wordBoundaryKind(.simple)
    }

    /// Every `.swift` file under `directory`, sorted for a stable report.
    static func swiftFiles(under directory: URL) throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil) else {
            throw CocoaError(.fileNoSuchFile)
        }
        return walker
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.path < $1.path }
    }

    static func violations(in file: URL, relativeTo root: URL) throws -> [Violation] {
        let name = file.path.replacingOccurrences(of: root.path + "/", with: "")
        return try violations(inSource: String(contentsOf: file, encoding: .utf8), file: name)
    }

    static func violations(inSource source: String, file: String) throws -> [Violation] {
        let compiled = try rules.map { (rule: $0, regex: try compile($0.pattern)) }
        var found: [Violation] = []
        for (index, line) in strippingComments(source).enumerated() {
            for (rule, regex) in compiled where line.contains(regex) {
                found.append(Violation(file: file,
                                       line: index + 1,
                                       rule: rule.name,
                                       snippet: line.trimmingCharacters(in: .whitespaces)))
            }
        }
        return found
    }

    /// Drops comments while preserving line numbering, so a violation reports
    /// the line a reader will open. String literals are kept — a hex colour
    /// usually arrives as `"#FF0000"`, and dropping strings would hide it.
    static func strippingComments(_ source: String) -> [String] {
        var output: [String] = []
        var inBlockComment = false

        for line in source.split(separator: "\n", omittingEmptySubsequences: false) {
            var kept = ""
            var inString = false
            var escaped = false
            var index = line.startIndex

            while index < line.endIndex {
                let character = line[index]
                let after = line.index(after: index)
                let next = after < line.endIndex ? line[after] : nil

                if inBlockComment {
                    if character == "*", next == "/" {
                        inBlockComment = false
                        index = line.index(index, offsetBy: 2)
                    } else {
                        index = after
                    }
                    continue
                }

                if inString {
                    kept.append(character)
                    if escaped {
                        escaped = false
                    } else if character == "\\" {
                        escaped = true
                    } else if character == "\"" {
                        inString = false
                    }
                    index = after
                    continue
                }

                if character == "/", next == "/" { break }
                if character == "/", next == "*" {
                    inBlockComment = true
                    index = line.index(index, offsetBy: 2)
                    continue
                }
                if character == "\"" { inString = true }
                kept.append(character)
                index = after
            }

            output.append(kept)
        }

        return output
    }
}
