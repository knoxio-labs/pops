import Foundation

/// One `func`, its body, and the attributes written above it.
internal struct SwiftDeclaration {
    let name: String
    /// The `@Test(…)` above this function, plus the `@Suite(…)` of the type it
    /// is declared in — a suite-wide trait covers every test in it, the way
    /// `ColorTokenTests` declares it once for the whole suite.
    let attributes: String
    let body: String
    let isTest: Bool

    func declaresATrait(named name: String) -> Bool {
        attributes.contains(name)
    }
}

/// Slices a Swift file into its function declarations by indentation rather
/// than by matching braces. swift-format owns this tree — `mise -C clients/ios
/// run format` is a required check — so a function's body is exactly the lines
/// between its signature and the first `}` back at the signature's own
/// indentation. Brace matching would be no more correct here and would have to
/// reason about braces inside string literals, which `TokenDisciplineScanner`'s
/// stripper deliberately leaves in place.
///
/// Its own file because it is machinery rather than a rule: what counts as a
/// declaration is the same question whichever scan is asking.
internal enum SwiftDeclarationSlicer {
    static func declarations(in lines: [String]) -> [SwiftDeclaration] {
        var declarations: [SwiftDeclaration] = []
        var suiteAttributes = ""
        var pendingAttributes = ""
        var index = 0
        while index < lines.count {
            let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("@Suite") {
                (suiteAttributes, index) = attribute(from: index, in: lines, endsAt: isATypeHeader)
                continue
            }
            if trimmed.hasPrefix("@Test") {
                (pendingAttributes, index) = attribute(from: index, in: lines) {
                    $0.contains("func ")
                }
                continue
            }
            guard let name = functionName(in: lines[index]) else {
                index += 1
                continue
            }
            let (body, end) = self.body(from: index, in: lines)
            declarations.append(
                SwiftDeclaration(
                    name: name,
                    attributes: pendingAttributes + suiteAttributes,
                    body: body,
                    isTest: !pendingAttributes.isEmpty))
            pendingAttributes = ""
            index = end
        }
        return declarations
    }

    /// The attribute lines from `start` up to — but not including — the
    /// declaration they are written above, and where that declaration begins.
    private static func attribute(
        from start: Int, in lines: [String], endsAt isDeclaration: (String) -> Bool
    ) -> (String, Int) {
        var collected = ""
        var index = start
        while index < lines.count, !isDeclaration(lines[index]) {
            collected += lines[index] + "\n"
            index += 1
        }
        return (collected, index)
    }

    /// The function beginning at `start`, and the line after it.
    private static func body(from start: Int, in lines: [String]) -> (String, Int) {
        let indentation = String(lines[start].prefix { $0 == " " })
        var collected = ""
        var index = start
        while index < lines.count {
            collected += lines[index] + "\n"
            if index > start, lines[index] == indentation + "}" { break }
            index += 1
        }
        return (collected, index + 1)
    }

    private static func isATypeHeader(_ line: String) -> Bool {
        line.contains(" struct ") || line.contains(" enum ") || line.contains(" class ")
    }

    private static func functionName(in line: String) -> String? {
        guard let keyword = line.range(of: "func ") else { return nil }
        let rest = line[keyword.upperBound...]
        guard let open = rest.firstIndex(of: "(") else { return nil }
        let name = rest[rest.startIndex..<open]
        guard !name.isEmpty, name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }) else {
            return nil
        }
        return String(name)
    }
}
