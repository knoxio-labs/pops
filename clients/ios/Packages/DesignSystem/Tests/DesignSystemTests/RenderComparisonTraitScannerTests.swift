import Testing

/// What the rule catches, against source held in a string. What it
/// deliberately lets through is `RenderComparisonTraitExemptionTests`; what
/// files it is applied to is `RenderComparisonTraitDisciplineTests`.
@Suite("Render comparison trait discipline rules")
internal struct RenderComparisonTraitScannerTests {
    private static func violations(_ source: String) -> [String] {
        RenderComparisonTraitScanner.violations(inSource: source, file: "planted.swift").map(\.test)
    }

    private static func reasons(_ source: String) -> [RenderComparisonTraitScanner.Reason] {
        RenderComparisonTraitScanner.violations(inSource: source, file: "planted.swift")
            .map(\.reason)
    }

    @Test("a file with its own ImageRenderer that compares with != and no trait is caught")
    func plantedInequalityViolationIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            """)

        #expect(Self.violations(source) == ["statesLookDifferent"])
    }

    @Test("a file with its own ImageRenderer comparing .light against .dark and no trait is caught")
    func plantedSchemeViolationIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("renders differently in light and dark")
                func rendersDifferently() throws {
                    let light = try #require(render(view, in: .light))
                    let dark = try #require(render(view, in: .dark))
                    #expect(light == dark, "will be replaced once the view exists")
                }
            """)

        #expect(Self.violations(source) == ["rendersDifferently"])
    }

    /// The gap this scanner was rewritten to close: a file that already
    /// carries the trait on one test gains a second comparison on a
    /// *different* test that forgets it. A file-scoped check reads the first
    /// test's trait and waves the second one through.
    @Test("a second comparison that forgets the trait is caught beside one that carries it")
    func aPartialInFileOmissionIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("PopsButton", .requiresCompiledColorCatalog)
                func schemesDiffer() throws {
                    let light = try #require(render(view, in: .light))
                    let dark = try #require(render(view, in: .dark))
                    #expect(light != dark)
                }

                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            """)

        #expect(Self.violations(source) == ["statesLookDifferent"])
    }

    /// The other escape route: the scan used to key on a helper literally
    /// named `render(`, so a suite whose helper was called anything else was
    /// invisible to it — by rename as easily as by intent.
    @Test("a rasterising helper under another name is still counted")
    func aRenamedHelperIsCaught() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(RenderComparisonTraitFixtures.helper(named: "snapshot"))

                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(snapshot(view(.one)))
                    let b = try #require(snapshot(view(.two)))
                    #expect(a != b)
                }
            }
            """

        #expect(Self.violations(source) == ["statesLookDifferent"])
    }

    /// No helper at all: the renderer is built in the test body and asked for
    /// two images. There is no call site to count, so the images are counted
    /// instead.
    @Test("a test that builds its own renderer inline and compares twice is caught")
    func anInlineRendererIsCaught() {
        let source = RenderComparisonTraitFixtures.bareSuite(
            """
                @Test("two states look different")
                func statesLookDifferent() throws {
                    let renderer = ImageRenderer(content: view(.one))
                    let a = try #require(renderer.cgImage)
                    renderer.content = view(.two)
                    let b = try #require(renderer.cgImage)
                    #expect(a != b)
                }
            """)

        #expect(Self.violations(source) == ["statesLookDifferent"])
    }

    /// The silent direction, and the one this rule was extended to reach: two
    /// *different* views rendered and asserted equal. On a build system that
    /// copied `Colors.xcassets` without compiling it both are the same blank
    /// canvas, so the assertion passes whatever the two views do — for as
    /// long as the test exists, with nobody looking at a green test.
    @Test("an equality between two different renders with no trait is caught")
    func plantedVacuousEqualityIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("a blank title falls back to the default one")
                func blankFallsBack() throws {
                    let blank = try #require(render(view(title: "   ")))
                    let stock = try #require(render(view()))
                    #expect(blank == stock)
                }
            """)

        #expect(Self.violations(source) == ["blankFallsBack"])
        #expect(Self.reasons(source) == [.undeclared])
    }

    /// The escape route the first half of the rule would otherwise leave
    /// open: answer the question with the trait that changes nothing. No
    /// equality between two renders survives an uncompiled catalogue —
    /// blankness is exactly what satisfies it — so this answer is always the
    /// wrong one, and unlike the inequality direction that is decidable
    /// without judging what the two views differ by.
    @Test("an equality-only comparison cannot answer with the opt-out")
    func anEqualityOnlyOptOutIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("a blank title falls back", .comparisonSurvivesAnUncompiledCatalog)
                func blankFallsBack() throws {
                    let blank = try #require(render(view(title: "   ")))
                    let stock = try #require(render(view()))
                    #expect(blank == stock)
                }
            """)

        #expect(Self.violations(source) == ["blankFallsBack"])
        #expect(Self.reasons(source) == [.optedOutOfAnEqualityOnlyComparison])
    }

    /// A determinism check is an equality too, and it is equally vacuous on
    /// that lane — it just makes no claim about the product while being so.
    /// It was exempt while the rule read inequalities only.
    @Test("a determinism check with no trait is caught")
    func anUndeclaredDeterminismCheckIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                @Test("renders the same way twice")
                func rendersDeterministically() throws {
                    let once = try #require(render(view))
                    let again = try #require(render(view))
                    #expect(once == again)
                }
            """)

        #expect(Self.violations(source) == ["rendersDeterministically"])
    }

    /// The comparison hidden one call deep, in a helper of the suite's own.
    @Test("a comparison moved into a helper is still the calling test's to declare")
    func aComparisonBehindAHelperIsCaught() {
        let source = RenderComparisonTraitFixtures.suite(
            """
                private func statesDiffer(_ one: State, _ two: State) throws -> Bool {
                    let a = try #require(render(view(one)))
                    let b = try #require(render(view(two)))
                    return a != b
                }

                @Test("two states look different")
                func statesLookDifferent() throws {
                    #expect(try statesDiffer(.one, .two))
                }
            """)

        #expect(Self.violations(source) == ["statesLookDifferent"])
    }
}
