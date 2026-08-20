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
/// ## Why an equality is asked too, and why only one answer is open to it
///
/// The two directions fail in opposite ways on an uncompiled-catalogue lane,
/// and the silent one is the worse one. `#expect(a != b)` on two blank
/// canvases *fails* — loudly, in CI, and somebody looks. `#expect(a == b)`
/// on the same two blank canvases *passes*, for as long as the test exists,
/// reporting coverage it does not have; that is what
/// `PrimitiveRenderingTests` did with the blank-retryTitle fallback until the
/// assertion moved to `StatePrimitiveTests` and became one about copy.
///
/// So an equality between renders is a comparison for this rule's purposes as
/// much as an inequality is — but unlike an inequality it has only one honest
/// answer available. `.comparisonSurvivesAnUncompiledCatalog` says "this
/// comparison holds without a palette", and no equality between two renders
/// can say that truthfully: blankness is precisely what satisfies it. A test
/// whose comparisons are all equalities is therefore caught for declaring the
/// opt-out just as surely as for declaring nothing, and
/// `.requiresCompiledColorCatalog` is the only trait that clears it. That is
/// what makes this half of the rule self-enforcing rather than a prompt to
/// think: the trait it forces disables the test on the lane where it would
/// have passed vacuously.
///
/// A determinism check — the same view rasterised twice — is in scope for the
/// same reason, and was deliberately out of it while the rule only read
/// inequalities. Two blank canvases are equal, so such a check verifies
/// nothing on that lane while reporting green, and the sibling comparisons it
/// exists to underwrite are disabled there anyway. Where a suite would
/// otherwise go dark on the host lane entirely, the "it rasterises at all"
/// half is split out as its own test, which renders once and so is no
/// comparison.
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
    /// Which of the two ways a render comparison can fail to say what lane it
    /// can answer on.
    enum Reason: Equatable {
        /// Compares two renders and says nothing at all.
        case undeclared
        /// Compares two renders only for equality, and claims the comparison
        /// holds without a compiled palette. Nothing does: two blank canvases
        /// are equal.
        case optedOutOfAnEqualityOnlyComparison
    }

    struct Violation: CustomStringConvertible {
        let file: String
        let test: String
        let reason: Reason

        var description: String {
            switch reason {
            case .undeclared:
                return "\(file): \(test) compares rendered output more than once and declares "
                    + "neither .requiresCompiledColorCatalog nor "
                    + ".comparisonSurvivesAnUncompiledCatalog"
            case .optedOutOfAnEqualityOnlyComparison:
                return "\(file): \(test) compares rendered output only for equality and declares "
                    + ".comparisonSurvivesAnUncompiledCatalog — two renders that resolved no "
                    + "colour are equal, so this comparison passes vacuously on exactly the lane "
                    + "the opt-out claims it holds on; it needs .requiresCompiledColorCatalog"
            }
        }
    }

    private static let requiresCatalog = "requiresCompiledColorCatalog"
    private static let survivesWithout = "comparisonSurvivesAnUncompiledCatalog"

    /// How an `ImageRenderer` hands back what it drew. A test that reaches for
    /// one of these twice has rasterised twice, whether or not a helper was
    /// involved.
    private static let rasterisations = [".cgImage", ".uiImage", ".nsImage"]

    static func violations(inSource source: String, file: String) -> [Violation] {
        let lines = TokenDisciplineScanner.strippingComments(source)
        let stripped = lines.joined(separator: "\n")
        guard ownsARenderer(stripped) else { return [] }

        let declarations = SwiftDeclarationSlicer.declarations(in: lines)
        let entryPoints = declarations.filter { ownsARenderer($0.body) }.map(\.name)
        let comparingHelpers = declarations.filter { declaration in
            !declaration.isTest && !entryPoints.contains(declaration.name)
                && rasterisationCount(in: declaration.body, callingAnyOf: entryPoints) >= 2
                && !renderComparisons(in: declaration.body, entryPoints: entryPoints).isEmpty
        }

        return declarations.compactMap { declaration -> Violation? in
            guard declaration.isTest else { return nil }
            let comparisons = self.comparisons(
                of: declaration, entryPoints: entryPoints, comparingHelpers: comparingHelpers)
            guard
                comparesTwoRenders(
                    declaration, comparisons: comparisons, entryPoints: entryPoints,
                    comparingHelpers: comparingHelpers)
            else { return nil }
            guard let reason = reason(declaration, comparisons: comparisons) else { return nil }
            return Violation(file: file, test: declaration.name, reason: reason)
        }
    }

    /// Why this test is a violation, or `nil` if it is not one.
    private static func reason(_ declaration: SwiftDeclaration, comparisons: [String]) -> Reason? {
        if declaration.declaresATrait(named: requiresCatalog) { return nil }
        guard declaration.declaresATrait(named: survivesWithout) else { return .undeclared }
        // The opt-out is a claim about a lane where every render is the same
        // placeholder. An inequality can hold there — that is what the real
        // opted-out tests in this tree assert, and what differs in them is
        // layout. An equality holds there unconditionally, which is not the
        // same thing as holding.
        return comparisons.contains { $0.contains("!=") }
            ? nil : .optedOutOfAnEqualityOnlyComparison
    }

    /// Where this test's comparison is actually written: its own body, plus
    /// the body of any helper of the suite's own that does the comparing for
    /// it. Both halves matter — the helper carries the `!=` or `==` that says
    /// which direction the comparison runs in.
    private static func comparisons(
        of declaration: SwiftDeclaration, entryPoints: [String],
        comparingHelpers: [SwiftDeclaration]
    ) -> [String] {
        let called = comparingHelpers.filter {
            occurrences(of: $0.name + "(", in: declaration.body) > 0
        }
        return ([declaration.body] + called.map(\.body)).flatMap {
            renderComparisons(in: $0, entryPoints: entryPoints)
        }
    }

    private static func comparesTwoRenders(
        _ declaration: SwiftDeclaration, comparisons: [String], entryPoints: [String],
        comparingHelpers: [SwiftDeclaration]
    ) -> Bool {
        if callCount(of: comparingHelpers.map(\.name), in: declaration.body) > 0 { return true }
        let rendered = rasterisationCount(in: declaration.body, callingAnyOf: entryPoints)
        let inline =
            entryPoints.contains(declaration.name)
            ? rasterisations.reduce(0) { $0 + occurrences(of: $1, in: declaration.body) } : 0
        return rendered + inline >= 2 && !comparisons.isEmpty
    }

    /// `ImageRenderer(`, and not `UIGraphicsImageRenderer(` — a UIKit
    /// rasteriser that draws exactly what it is told to and resolves no
    /// tokens, so it has nothing to do with whether the catalogue compiled.
    /// `ReceiptPageEncodingTests` builds one to make a JPEG for an upload
    /// test, and a plain `contains` would drag that whole file into scope.
    private static func ownsARenderer(_ source: String) -> Bool {
        containsIdentifier("ImageRenderer(", in: source)
    }

    /// `needle` as a whole word rather than as a substring of a longer
    /// identifier — so a local called `a` is not found inside `data`, and
    /// `ImageRenderer(` is not found inside `UIGraphicsImageRenderer(`.
    ///
    /// A boundary is only demanded on the sides where the needle's own edge
    /// is part of an identifier: `ImageRenderer(` ends in a paren, and what
    /// follows it is the call's first argument.
    private static func containsIdentifier(_ needle: String, in haystack: String) -> Bool {
        let isIdentifier = { (character: Character?) in
            character.map { $0.isLetter || $0.isNumber || $0 == "_" } ?? false
        }
        let checkBefore = isIdentifier(needle.first)
        let checkAfter = isIdentifier(needle.last)
        var searched = Substring(haystack)
        while let found = searched.range(of: needle) {
            let before =
                found.lowerBound == searched.startIndex
                ? nil : searched[searched.index(before: found.lowerBound)]
            let after = found.upperBound == searched.endIndex ? nil : searched[found.upperBound]
            if (!checkBefore || !isIdentifier(before)) && (!checkAfter || !isIdentifier(after)) {
                return true
            }
            searched = searched[found.upperBound...]
        }
        return false
    }

    /// The lines that assert something about two rasterised images, in either
    /// direction: they must differ, or they must match.
    ///
    /// It has to be *these* operands, and not merely an `==` somewhere in a
    /// test that also rendered twice. That distinction did not matter while
    /// the rule read `!=` only — an inequality in a rendering suite is nearly
    /// always about pixels — but an equality is the commonest assertion in
    /// Swift, and reading every one of them as a render comparison flags
    /// `ReceiptCaptureFlowTests.aSecondReceiptResubmitsThroughTheView`, which
    /// reuses one `ImageRenderer` across two submissions and then asserts
    /// about a repository's call count. So an operand has to be traceable to
    /// a render: a local bound to one, or a rasterising call written into the
    /// comparison itself.
    ///
    /// The comparison also has to be spelled out at all, because rasterising
    /// twice and asserting nothing is a real thing tests here do:
    /// `PrimitiveRenderingTests.loadingState` rasterises `ProgressView` in
    /// each scheme purely to prove it rasterises, and deliberately compares
    /// neither — an animation does not render the same way twice. Reading
    /// that as a comparison would demand a declaration about an assertion
    /// that does not exist.
    private static func renderComparisons(in body: String, entryPoints: [String]) -> [String] {
        let bindings = renderedBindings(in: body, entryPoints: entryPoints)
        return body.split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { line in
                guard line.contains("==") || line.contains("!=") else { return false }
                return callCount(of: entryPoints, in: line) > 0
                    || bindings.contains { containsIdentifier($0, in: line) }
            }
    }

    /// The locals holding something a rasterising entry point handed back.
    ///
    /// Accumulated across continuation lines rather than read one line at a
    /// time: swift-format wraps a `#require(render(...))` that does not fit,
    /// leaving the `let` and the render call several lines apart — which is
    /// how most of the real comparisons in this tree are written.
    private static func renderedBindings(in body: String, entryPoints: [String]) -> [String] {
        let lines = body.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var bindings: [String] = []
        var index = 0
        while index < lines.count {
            guard let name = boundName(in: lines[index]) else {
                index += 1
                continue
            }
            var statement = lines[index]
            var depth = parenBalance(statement)
            while depth > 0, index + 1 < lines.count {
                index += 1
                statement += lines[index]
                depth += parenBalance(lines[index])
            }
            if callCount(of: entryPoints, in: statement) > 0
                || rasterisations.contains(where: { statement.contains($0) })
            {
                bindings.append(name)
            }
            index += 1
        }
        return bindings
    }

    /// The name a `let`/`var` line binds, if it binds a single one. A tuple
    /// destructuring is not one, and is deliberately not resolved: nothing in
    /// these suites binds a render that way, and guessing would be worse than
    /// missing it.
    private static func boundName(in line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("let ") || trimmed.hasPrefix("var ") else { return nil }
        let rest = trimmed.dropFirst(4).drop { $0 == " " }
        let name = rest.prefix { $0.isLetter || $0.isNumber || $0 == "_" }
        guard !name.isEmpty, rest.dropFirst(name.count).drop(while: { $0 == " " }).first == "="
        else {
            return nil
        }
        return String(name)
    }

    private static func parenBalance(_ text: String) -> Int {
        occurrences(of: "(", in: text) - occurrences(of: ")", in: text)
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
}
