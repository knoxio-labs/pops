import Testing

/// What the rule deliberately lets through. A scan that only ever proved it
/// catches things would be free to catch everything, and the cost of that is
/// paid by whoever writes the next rendering suite — see the two real files
/// named below, both of which a coarser version of this rule flagged.
///
/// The caught shapes are `RenderComparisonTraitScannerTests`.
@Suite("Render comparison trait exemptions")
internal struct RenderComparisonTraitExemptionTests {
    private static func isClean(_ source: String) -> Bool {
        RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty
    }

    @Test("the trait on the test itself clears it")
    func theTraitOnTheTestClearsIt() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("two states look different", .requiresCompiledColorCatalog)
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            """)

        #expect(Self.isClean(source))
    }

    /// The deliberate other answer: this comparison is about a sentence, not a
    /// colour, and says so rather than saying nothing.
    @Test("the explicit opt-out clears it too")
    func theOptOutClearsIt() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test(
                    "an extra sentence changes the layout",
                    .comparisonSurvivesAnUncompiledCatalog)
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            """)

        #expect(Self.isClean(source))
    }

    /// `ColorTokenTests` declares it once for the whole suite rather than on
    /// every test in it, and that has to keep working.
    @Test("the trait on the enclosing suite covers its tests")
    func theTraitOnTheSuiteClearsIt() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            """, traits: ", .requiresCompiledColorCatalog")

        #expect(Self.isClean(source))
    }

    @Test("rendering once, or rendering twice and asserting equality, is not a comparison")
    func determinismChecksAreNotFlagged() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("renders, and renders the same way twice")
                func rendersDeterministically() throws {
                    let once = try #require(render(view))
                    let again = try #require(render(view))
                    #expect(once == again)
                }
            """)

        #expect(Self.isClean(source))
    }

    /// `PrimitiveRenderingTests.loadingState` is the real test this stands in
    /// for: `ProgressView` animates, so it is rasterised in each scheme to
    /// prove it rasterises and compared with nothing. Two schemes on their own
    /// are not a colour-scheme comparison.
    @Test("rendering in both schemes and comparing neither is not a comparison")
    func renderingBothSchemesWithoutComparingIsNotFlagged() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("rasterises at all, in both schemes")
                func rendersInBothSchemes() throws {
                    _ = try #require(render(view, in: .light))
                    _ = try #require(render(view, in: .dark))
                }
            """)

        #expect(Self.isClean(source))
    }

    @Test("a lone render, whatever else the test asserts, is not a comparison")
    func singleRenderIsNotFlagged() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("rasterises at all")
                func rendersOnce() throws {
                    let drawn = try #require(render(view))
                    #expect(drawn != nil)
                }
            """)

        #expect(Self.isClean(source))
    }

    /// A neighbouring test's unrelated inequality is not this test's
    /// comparison — the reading that made the old check file-scoped is
    /// exactly what per-test slicing has to stop doing in the other direction.
    /// `ReceiptCaptureFlowTests` is the real file: it reuses one
    /// `ImageRenderer` across two submissions and compares two receipt ids
    /// several tests away.
    @Test("an inequality in a different test does not implicate this one")
    func anInequalityElsewhereIsNotBorrowed() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("two identifiers differ")
                func identifiersDiffer() throws {
                    #expect(first.id != second.id)
                }

                @Test("renders, and renders the same way twice")
                func rendersDeterministically() throws {
                    let once = try #require(render(view))
                    let again = try #require(render(view))
                    #expect(once == again)
                }
            """)

        #expect(Self.isClean(source))
    }

    @Test("a comment reproducing the violation's shape cannot trip the scan")
    func commentsAreStripped() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                // render(a) != render(b) is what a real comparison would look like.
                @Test("rasterises at all")
                func rendersOnce() throws {
                    let drawn = try #require(render(view))
                    #expect(drawn != nil)
                }
            """)

        #expect(Self.isClean(source))
    }

    /// UIKit's own rasteriser draws exactly what it is handed and resolves no
    /// tokens, so a file that only builds one of those has nothing to declare.
    /// `ReceiptPageEncodingTests` is the real file this stands in for.
    @Test("a UIGraphicsImageRenderer is not an ImageRenderer")
    func theUIKitRendererIsOutOfScope() {
        let source = RenderComparisonTraitFixtures.bareSuite(
            """
                private static func jpeg(size: CGSize) -> Data {
                    UIGraphicsImageRenderer(size: size).jpegData(withCompressionQuality: 1)
                }

                @Test("two encodings differ")
                func encodingsDiffer() throws {
                    #expect(jpeg(size: .zero) != jpeg(size: .one))
                }
            """)

        #expect(Self.isClean(source))
    }

    /// The false positive this scanner exists to avoid: `PopsButtonTests
    /// .disabledIsDistinct` calls `PrimitiveRenderingTests.render(...)` —
    /// another file's helper — to compare an enabled button against a
    /// disabled one, and what differs is opacity, not colour. A file that
    /// never sets up `ImageRenderer` itself is borrowing someone else's
    /// rendering, not making a judgement call about the trait, so it is out
    /// of scope for this scan even though it does compare two renders with
    /// `!=`.
    @Test("a file with no ImageRenderer of its own is out of scope, even if it compares with !=")
    func borrowedRenderHelperIsNotFlagged() {
        let source = RenderComparisonTraitFixtures.bareSuite(
            """
                @Test("disabled renders differently from enabled")
                func disabledIsDistinct() throws {
                    let enabled = try #require(PrimitiveRenderingTests.render(PopsButton("Pair") {}))
                    let disabled = try #require(
                        PrimitiveRenderingTests.render(PopsButton("Pair") {}.disabled(true)))
                    #expect(enabled != disabled)
                }
            """)

        #expect(Self.isClean(source))
    }
}
