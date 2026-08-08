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

    private enum Mode {
        case code
        case blockComment(depth: Int)
        case string(pounds: Int, multiline: Bool)
    }

    /// Drops comments while preserving line numbering, so a violation reports
    /// the line a reader will open. String literals are *kept* — a hex colour
    /// usually arrives as `"#FF0000"`, and dropping strings would hide it.
    ///
    /// The state carries across lines, and that is the whole difficulty. A
    /// per-line scanner treats a `/*` inside a multi-line string as a comment
    /// opener and silently swallows every line after it, which turns the guard
    /// into one that reports nothing; and a `Bool` for block comments makes
    /// `/* a /* b */ c */` end early, so `c` is scanned as code. So: nesting
    /// depth is counted, and string state tracks the `#` delimiter count so a
    /// raw string's `\"` is content rather than an escape.
    static func strippingComments(_ source: String) -> [String] {
        let characters = Array(source)
        var lines: [String] = []
        var current = ""
        var mode = Mode.code
        var index = 0

        func keep(_ character: Character) {
            if character == "\n" {
                lines.append(current)
                current = ""
            } else {
                current.append(character)
            }
        }

        func keep(_ range: Range<Int>) {
            for position in range where position < characters.count { keep(characters[position]) }
        }

        func drop(_ character: Character) {
            if character == "\n" {
                lines.append(current)
                current = ""
            }
        }

        func matches(_ token: String, at start: Int) -> Bool {
            let token = Array(token)
            guard start >= 0, start + token.count <= characters.count else { return false }
            return !zip(token.indices, token).contains { characters[start + $0.0] != $0.1 }
        }

        func poundRun(from start: Int) -> Int {
            var count = 0
            while start + count < characters.count, characters[start + count] == "#" { count += 1 }
            return count
        }

        while index < characters.count {
            let character = characters[index]

            switch mode {
            case .code:
                if matches("//", at: index) {
                    while index < characters.count, characters[index] != "\n" { index += 1 }
                    continue
                }
                if matches("/*", at: index) {
                    mode = .blockComment(depth: 1)
                    index += 2
                    continue
                }
                let pounds = poundRun(from: index)
                if matches("\"", at: index + pounds) {
                    let multiline = matches("\"\"\"", at: index + pounds)
                    let opener = pounds + (multiline ? 3 : 1)
                    keep(index ..< index + opener)
                    mode = .string(pounds: pounds, multiline: multiline)
                    index += opener
                    continue
                }
                keep(character)
                index += 1

            case .blockComment(let depth):
                if matches("/*", at: index) {
                    mode = .blockComment(depth: depth + 1)
                    index += 2
                    continue
                }
                if matches("*/", at: index) {
                    mode = depth <= 1 ? .code : .blockComment(depth: depth - 1)
                    index += 2
                    continue
                }
                drop(character)
                index += 1

            case .string(let pounds, let multiline):
                // A single-line literal cannot span a newline, so an unbalanced
                // quote desyncs one line rather than the rest of the file.
                if character == "\n", !multiline {
                    mode = .code
                    keep(character)
                    index += 1
                    continue
                }
                if character == "\\", poundRun(from: index + 1) == pounds {
                    let escape = 1 + pounds + 1
                    keep(index ..< index + escape)
                    index += escape
                    continue
                }
                let quote = multiline ? "\"\"\"" : "\""
                if matches(quote, at: index), poundRun(from: index + quote.count) == pounds {
                    let closer = quote.count + pounds
                    keep(index ..< index + closer)
                    mode = .code
                    index += closer
                    continue
                }
                keep(character)
                index += 1
            }
        }

        lines.append(current)
        return lines
    }
}
