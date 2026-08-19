import Foundation

/// Detects a test file that compares two or more `ImageRenderer` results —
/// across colour schemes or across states — without declaring
/// `.requiresCompiledColorCatalog` anywhere in the file. The gap
/// `CompiledColorCatalogFloorTests` cannot close: that suite proves the trait
/// is honoured everywhere it is *declared*, on the one lane where the
/// precondition should hold, but nothing previously proved a *new* rendering
/// suite remembered to declare it in the first place. A suite that forgot
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
/// Deliberately file-scoped rather than per-test. Whether one *specific*
/// comparison depends on colour is a judgement call this codebase makes test
/// by test — `TransactionDetailRenderingTests.theCanvasFitsTheWholeRecord`
/// carries the trait for a comparison that is really about layout, while
/// `ReceiptCaptureRenderingTests.problemsAreDrawn` compares two renders
/// without it because what differs is a sentence, not a colour — and no text
/// scan can tell those apart from the syntax alone. What it can tell,
/// reliably, is whether a file that is plainly in the business of comparing
/// rendered output ever mentions the trait at all. Every real file in this
/// codebase that does such a comparison already does, which is what
/// `RenderComparisonTraitDisciplineTests` checks against the real tree; a
/// file that mentions the trait nowhere while comparing renders repeatedly
/// is the shape the actual incident took, and the shape planted in
/// `RenderComparisonTraitDisciplineTests`' own self-test.
internal enum RenderComparisonTraitScanner {
    struct Violation: CustomStringConvertible {
        let file: String

        var description: String {
            "\(file): compares rendered output more than once but never declares "
                + ".requiresCompiledColorCatalog anywhere in the file"
        }
    }

    private static let traitName = "requiresCompiledColorCatalog"

    static func violations(inSource source: String, file: String) -> [Violation] {
        let stripped = TokenDisciplineScanner.strippingComments(source).joined(separator: "\n")
        guard looksLikeARenderComparison(stripped), !stripped.contains(traitName) else {
            return []
        }
        return [Violation(file: file)]
    }

    /// A file that constructs its own `ImageRenderer(` — the convention every
    /// rendering suite in this codebase follows, see any `*RenderingTests.swift`
    /// — and calls a `render(`-named helper at least twice, compared either
    /// with an inequality — the shape a "these states must look different"
    /// assertion takes — or across an explicit `.light`/`.dark` pair.
    ///
    /// Requiring `ImageRenderer(` in the same file, not just two `render(`
    /// calls, is what keeps this from flagging `PopsButtonTests
    /// .disabledIsDistinct`: it calls another file's `render(` helper to
    /// compare an enabled button against a disabled one, and that difference
    /// is opacity — real regardless of whether the colour catalogue
    /// compiled — not colour. A file that owns no `ImageRenderer` of its own
    /// is borrowing someone else's judgement call about the trait, not
    /// making a new one; only a file setting up the rendering itself can
    /// have forgotten to gate it, which is the shape `ReceiptCaptureRenderingTests`
    /// actually took.
    private static func looksLikeARenderComparison(_ source: String) -> Bool {
        guard source.contains("ImageRenderer(") else { return false }
        // The helper's own declaration — `func render(...)` — contains the
        // substring `render(` too, and every file in scope here defines one.
        // Left uncorrected, that declaration alone would count as a first
        // "call", so a file with exactly one real call site would already
        // read as two and the threshold below would mean nothing.
        let renderTokenCount = source.components(separatedBy: "render(").count - 1
        let declarationCount = source.components(separatedBy: "func render(").count - 1
        let renderCallCount = renderTokenCount - declarationCount
        guard renderCallCount >= 2 else { return false }
        let comparesInequality = source.contains("!=")
        let comparesBothSchemes = source.contains(".light") && source.contains(".dark")
        return comparesInequality || comparesBothSchemes
    }
}
