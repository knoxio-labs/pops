import Foundation

/// Detects a *test* that compares two or more `ImageRenderer` results —
/// across colour schemes or across states — without saying, on that test,
/// which of the two things it is: an assertion that needs the colour
/// catalogue compiled (`.requiresCompiledColorCatalog`), or one that holds
/// without it (`.comparisonSurvivesAnUncompiledCatalog`). The gap
/// `CompiledColorCatalogFloorTests` cannot close: that suite proves the trait
/// is honoured everywhere it is *declared*, on the one lane where the
/// precondition should hold, but nothing there proves a *new* rendering
/// comparison remembered to declare it in the first place. One that forgot
/// would render the same missing-asset placeholder for every state on an
/// uncompiled-catalogue host toolchain, see identical images, and read that
/// as "these screens are identical" rather than "the palette did not
/// compile" — passing locally and failing on CI. That is exactly what
/// happened to `ReceiptCaptureRenderingTests`: a brand-new rendering file
/// landed with the trait declared nowhere in it.
///
/// A text scan, not a compiler check, for the same reason
/// `TokenDisciplineScanner` is one: nothing in the type system distinguishes
/// "renders a view" from "renders it more than once and compares the
/// results", and a scan is what lets the rule reach test targets this
/// package never links.
///
/// ## Why one of two traits, rather than one trait
///
/// Whether a *specific* comparison depends on colour is a judgement call this
/// codebase makes test by test, and no scan can recover it from syntax:
/// `TransactionDetailRenderingTests.theCanvasFitsTheWholeRecord` carries
/// `.requiresCompiledColorCatalog` for a comparison that is really about
/// layout, while `ReceiptCaptureRenderingTests.problemsAreDrawn` compares two
/// renders and holds without a palette, because what differs is a sentence's
/// worth of layout rather than a colour. Demanding the first trait everywhere
/// would be wrong about the second test; demanding nothing is what let the
/// incident happen. So the scan demands an *answer* rather than a particular
/// one, and `.comparisonSurvivesAnUncompiledCatalog` is how a test says
/// the answer is "no" on the record instead of by omission — which is the
/// difference between a decision and a forgetting, and the only difference a
/// reviewer can see.
///
/// ## What it keys on, and why not on a name
///
/// A `render(`-named helper is the convention every rendering suite here
/// follows, but keying on that name would leave the rule dodgeable by calling
/// the helper something else — accidentally as much as deliberately. So the
/// rasterising entry points are *discovered*: any function in the file whose
/// body constructs an `ImageRenderer` is one, whatever it is called, and the
/// calls counted are calls to those. A test that sets up its own
/// `ImageRenderer` inline, with no helper to call, is counted by how many
/// times it pulls an image out of it.
///
/// A file that owns no `ImageRenderer` at all is out of scope entirely. That
/// is what keeps this from flagging `PopsButtonTests.disabledIsDistinct`: it
/// calls another file's helper to compare an enabled button against a
/// disabled one, and that difference is opacity — real whether or not the
/// catalogue compiled. A file borrowing someone else's rendering is borrowing
/// their judgement call about the trait too, not making a new one.
internal enum RenderComparisonTraitScanner {
    struct Violation: CustomStringConvertible {
        let file: String
        let test: String

        var description: String {
            "\(file): \(test) compares rendered output more than once and declares neither "
                + ".requiresCompiledColorCatalog nor .comparisonSurvivesAnUncompiledCatalog"
        }
    }

    private static let traitNames = [
        "requiresCompiledColorCatalog", "comparisonSurvivesAnUncompiledCatalog",
    ]

    /// How an `ImageRenderer` hands back what it drew. A test that reaches for
    /// one of these twice has rasterised twice, whether or not a helper was
    /// involved.
    private static let rasterisations = [".cgImage", ".uiImage", ".nsImage"]

    static func violations(inSource source: String, file: String) -> [Violation] {
        let lines = TokenDisciplineScanner.strippingComments(source)
        let stripped = lines.joined(separator: "\n")
        guard ownsARenderer(stripped) else { return [] }

        let declarations = Self.declarations(in: lines)
        let entryPoints = declarations.filter { ownsARenderer($0.body) }.map(\.name)
        let comparingHelpers = declarations.filter { declaration in
            !declaration.isTest && !entryPoints.contains(declaration.name)
                && rasterisationCount(in: declaration.body, callingAnyOf: entryPoints) >= 2
                && comparesRenders(declaration.body)
        }.map(\.name)

        return declarations.filter { declaration in
            declaration.isTest && !declaration.declaresATrait(oneOf: traitNames)
                && comparesTwoRenders(
                    declaration, entryPoints: entryPoints, comparingHelpers: comparingHelpers)
        }.map { Violation(file: file, test: $0.name) }
    }

    private static func comparesTwoRenders(
        _ declaration: Declaration, entryPoints: [String], comparingHelpers: [String]
    ) -> Bool {
        if callCount(of: comparingHelpers, in: declaration.body) > 0 { return true }
        let rendered = rasterisationCount(in: declaration.body, callingAnyOf: entryPoints)
        let inline =
            entryPoints.contains(declaration.name)
            ? rasterisations.reduce(0) { $0 + occurrences(of: $1, in: declaration.body) } : 0
        return rendered + inline >= 2 && comparesRenders(declaration.body)
    }

    /// `ImageRenderer(`, and not `UIGraphicsImageRenderer(` — a UIKit
    /// rasteriser that draws exactly what it is told to and resolves no
    /// tokens, so it has nothing to do with whether the catalogue compiled.
    /// `ReceiptPageEncodingTests` builds one to make a JPEG for an upload
    /// test, and a plain `contains` would drag that whole file into scope.
    private static func ownsARenderer(_ source: String) -> Bool {
        var searched = Substring(source)
        while let found = searched.range(of: "ImageRenderer(") {
            let precedes =
                found.lowerBound == searched.startIndex
                ? nil : searched[searched.index(before: found.lowerBound)]
            if precedes.map({ !$0.isLetter && !$0.isNumber && $0 != "_" }) ?? true { return true }
            searched = searched[found.upperBound...]
        }
        return false
    }

    /// The shape a "these must look different" assertion takes: an
    /// inequality, or a light-against-dark pair that is compared at all.
    ///
    /// The second clause needs the comparison spelled out as well as the two
    /// schemes, because rendering in both and asserting nothing is a real
    /// thing tests here do: `PrimitiveRenderingTests.loadingState` rasterises
    /// `ProgressView` in each scheme purely to prove it rasterises, and
    /// deliberately compares neither — an animation does not render the same
    /// way twice. Reading that as a colour-scheme comparison would demand a
    /// declaration about an assertion that does not exist.
    private static func comparesRenders(_ body: String) -> Bool {
        let bothSchemes = body.contains(".light") && body.contains(".dark")
        return body.contains("!=") || (bothSchemes && body.contains("=="))
    }

    private static func rasterisationCount(in body: String, callingAnyOf entryPoints: [String])
        -> Int
    {
        callCount(of: entryPoints, in: body)
    }

    private static func callCount(of names: [String], in body: String) -> Int {
        names.reduce(0) { total, name in
            total + occurrences(of: name + "(", in: body)
                - occurrences(of: "func " + name + "(", in: body)
        }
    }

    private static func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// One `func`, its body, and the attributes written above it.
    private struct Declaration {
        let name: String
        /// The `@Test(…)` above this function, plus the `@Suite(…)` of the
        /// type it is declared in — a suite-wide trait covers every test in
        /// it, the way `ColorTokenTests` declares it once for the whole suite.
        let attributes: String
        let body: String
        let isTest: Bool

        func declaresATrait(oneOf names: [String]) -> Bool {
            names.contains { attributes.contains($0) }
        }
    }

    /// Slices the file into declarations by indentation rather than by
    /// matching braces. swift-format owns this tree — `mise -C clients/ios run
    /// format` is a required check — so a function's body is exactly the lines
    /// between its signature and the first `}` back at the signature's own
    /// indentation. Brace matching would be no more correct here and would
    /// have to reason about braces inside string literals, which
    /// `TokenDisciplineScanner`'s stripper deliberately leaves in place.
    private static func declarations(in lines: [String]) -> [Declaration] {
        var declarations: [Declaration] = []
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
                Declaration(
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
