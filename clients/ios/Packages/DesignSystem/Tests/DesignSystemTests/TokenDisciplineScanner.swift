import Foundation

/// Scans Swift source for the two things this package exists to make
/// impossible: a colour that is not a token, and a metric that is not a step on
/// the scale. It is a text scan rather than a compiler check because Swift has
/// no way to withdraw `Color.red` from a module that imports SwiftUI.
///
/// A text scan is also what lets the rule reach past this package: the scan
/// reads files, so it never needs to import the module it is judging.
internal enum TokenDisciplineScanner {
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
        Rule(
            name: "hex colour literal",
            pattern: #"#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![0-9A-Za-z_])"#),
        Rule(
            name: "system colour",
            pattern: #"\.(?:red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple"#
                + #"|pink|brown|white|gray|grey|black|clear|primary|secondary|accentColor)"#
                + #"(?![0-9A-Za-z_])"#
        ),
        Rule(
            name: "raw colour construction",
            pattern:
                #"\b(?:UIColor|NSColor|CGColor)\b|\bColor\(\s*(?:\.sRGB|red\s*:|hue\s*:|white\s*:|cgColor\s*:)"#
        ),
        Rule(
            name: "numeric metric literal",
            pattern: #"\.padding\(\s*-?\d|\.padding\(\s*\.\w+\s*,\s*-?\d"#
                + #"|\bspacing\s*:\s*-?\d|\bcornerRadius\s*:\s*-?\d|\.cornerRadius\(\s*-?\d"#
                + #"|\blineWidth\s*:\s*-?\d"#
                + #"|\.frame\(\s*(?:width|height|minWidth|maxWidth|minHeight|maxHeight"#
                + #"|idealWidth|idealHeight)\s*:\s*-?\d"#
        ),
        Rule(
            name: "fixed font size",
            pattern: #"\.system\(\s*size\s*:|\bFont\.custom\("#),
    ]

    /// Swift `Regex` defaults to Unicode word boundaries, under which
    /// `UIColor.systemBackground` is one word and `\bUIColor\b` never matches
    /// it. Lookbehind — the obvious alternative — is unimplemented, so the
    /// boundary kind is what has to change.
    private static func compile(_ pattern: String) throws -> Regex<AnyRegexOutput> {
        try Regex(pattern).wordBoundaryKind(.simple)
    }

    /// The directory name that means "a generator wrote this", spelled the same
    /// way `scripts/swift-sources.sh` and `.swiftlint.yml` spell it.
    static let generatedDirectoryName = "Generated"

    /// Every hand-written `.swift` file under `directory`, sorted for a stable
    /// report.
    ///
    /// Generated sources are skipped, because the rules below describe choices a
    /// person made and a generator makes none of them: an OpenAPI enum case
    /// named `secondary` reaches its own call sites as `.secondary`, which the
    /// system-colour rule cannot tell from a colour — and generated code is the
    /// one place a violation cannot be fixed at the call site. Skipping is safe
    /// only because `scripts/swift-sources.sh check` fails on hand-written code
    /// inside a `Generated` directory, so this cannot become somewhere to hide.
    static func swiftFiles(under directory: URL) throws -> [URL] {
        guard
            let walker = FileManager.default.enumerator(
                at: directory, includingPropertiesForKeys: nil)
        else {
            throw CocoaError(.fileNoSuchFile)
        }
        var files: [URL] = []
        for element in walker {
            // The enumerator is documented to yield `URL`s. Casting with `as?`
            // and compacting would turn "this walk is not what we think it is"
            // into a file quietly dropped from the scan, which is the one
            // failure this whole check exists to make impossible.
            guard let file = element as? URL else { throw CocoaError(.fileReadUnknown) }
            guard file.pathExtension == "swift",
                !file.pathComponents.dropLast().contains(generatedDirectoryName)
            else { continue }
            files.append(file)
        }
        return files.sorted { $0.path < $1.path }
    }

    static func violations(in file: URL, relativeTo root: URL) throws -> [Violation] {
        return try violations(
            inSource: String(contentsOf: file, encoding: .utf8),
            file: relativePath(of: file, under: root))
    }

    /// `/var` and `/private/var` are the same directory and `FileManager` hands
    /// back whichever spelling it prefers, which is not always the one the root
    /// was written with. Reduce both to one spelling before stripping one from
    /// the other, or a report comes out as absolute paths nobody can scan.
    ///
    /// The root is removed only as a genuine prefix. `replacingOccurrences`
    /// removes its target from anywhere in the string, so a file whose path
    /// happens to contain the root's path a second time — nested under a
    /// directory that repeats it — would have that occurrence stripped too,
    /// producing a relative path that is wrong rather than merely long. A
    /// file the root does not actually contain returns its full resolved
    /// path instead: absolute and honest beats short and wrong in a report a
    /// developer has to act on.
    private static func relativePath(of file: URL, under root: URL) -> String {
        let resolvedFile = file.resolvingSymlinksInPath().path
        let prefix = root.resolvingSymlinksInPath().path + "/"
        guard resolvedFile.hasPrefix(prefix) else { return resolvedFile }
        return String(resolvedFile.dropFirst(prefix.count))
    }

    static func violations(inSource source: String, file: String) throws -> [Violation] {
        let compiled = try rules.map { (rule: $0, regex: try compile($0.pattern)) }
        var found: [Violation] = []
        for (index, line) in strippingComments(source).enumerated() {
            for (rule, regex) in compiled where line.contains(regex) {
                found.append(
                    Violation(
                        file: file,
                        line: index + 1,
                        rule: rule.name,
                        snippet: line.trimmingCharacters(in: .whitespaces)))
            }
        }
        return found
    }

    /// Drops comments while preserving line numbering, so a violation reports
    /// the line a reader will open. String literals are *kept* — a hex colour
    /// usually arrives as `"#FF0000"`, and dropping strings would hide it.
    static func strippingComments(_ source: String) -> [String] {
        var stripper = CommentStripper(source: source)
        return stripper.run()
    }
}

/// The comment stripper's scan state, which is why it is a type rather than a
/// long function: the cursor, the emitted lines, the mode and the four helpers
/// that read them are one piece of state passed around together.
///
/// That state carrying across lines is the whole difficulty. A per-line scanner
/// treats a `/*` inside a multi-line string as a comment opener and silently
/// swallows every line after it, which turns the guard into one that reports
/// nothing; and a `Bool` for block comments makes `/* a /* b */ c */` end early,
/// so `c` is scanned as code. So: nesting depth is counted, and string state
/// tracks the `#` delimiter count so a raw string's `\"` is content rather than
/// an escape.
private struct CommentStripper {
    private enum Mode {
        case code
        case blockComment(depth: Int)
        case string(pounds: Int, multiline: Bool)
    }

    private let characters: [Character]
    private var lines: [String] = []
    private var current = ""
    private var mode = Mode.code
    private var index = 0

    init(source: String) {
        characters = Array(source)
    }

    mutating func run() -> [String] {
        while index < characters.count {
            switch mode {
            case .code:
                scanCode()
            case .blockComment(let depth):
                scanBlockComment(depth: depth)
            case .string(let pounds, let multiline):
                scanString(pounds: pounds, multiline: multiline)
            }
        }
        lines.append(current)
        return lines
    }

    private mutating func scanCode() {
        if matches("//", at: index) {
            while index < characters.count, characters[index] != "\n" { index += 1 }
            return
        }
        if matches("/*", at: index) {
            mode = .blockComment(depth: 1)
            index += 2
            return
        }
        let pounds = poundRun(from: index)
        if matches("\"", at: index + pounds) {
            let multiline = matches("\"\"\"", at: index + pounds)
            let opener = pounds + (multiline ? 3 : 1)
            keep(index..<index + opener)
            mode = .string(pounds: pounds, multiline: multiline)
            index += opener
            return
        }
        keep(characters[index])
        index += 1
    }

    private mutating func scanBlockComment(depth: Int) {
        if matches("/*", at: index) {
            mode = .blockComment(depth: depth + 1)
            index += 2
            return
        }
        if matches("*/", at: index) {
            mode = depth <= 1 ? .code : .blockComment(depth: depth - 1)
            index += 2
            return
        }
        drop(characters[index])
        index += 1
    }

    private mutating func scanString(pounds: Int, multiline: Bool) {
        let character = characters[index]

        // A single-line literal cannot span a newline, so an unbalanced quote
        // desyncs one line rather than the rest of the file.
        if character == "\n", !multiline {
            mode = .code
            keep(character)
            index += 1
            return
        }
        if character == "\\", poundRun(from: index + 1) == pounds {
            let escape = 1 + pounds + 1
            keep(index..<index + escape)
            index += escape
            return
        }
        let quote = multiline ? "\"\"\"" : "\""
        if matches(quote, at: index), poundRun(from: index + quote.count) == pounds {
            let closer = quote.count + pounds
            keep(index..<index + closer)
            mode = .code
            index += closer
            return
        }
        keep(character)
        index += 1
    }

    private mutating func keep(_ character: Character) {
        if character == "\n" {
            lines.append(current)
            current = ""
        } else {
            current.append(character)
        }
    }

    private mutating func keep(_ range: Range<Int>) {
        for position in range where position < characters.count { keep(characters[position]) }
    }

    private mutating func drop(_ character: Character) {
        if character == "\n" {
            lines.append(current)
            current = ""
        }
    }

    private func matches(_ token: String, at start: Int) -> Bool {
        let token = Array(token)
        guard start >= 0, start + token.count <= characters.count else { return false }
        return !zip(token.indices, token).contains { characters[start + $0.0] != $0.1 }
    }

    private func poundRun(from start: Int) -> Int {
        var count = 0
        while start + count < characters.count, characters[start + count] == "#" { count += 1 }
        return count
    }
}
