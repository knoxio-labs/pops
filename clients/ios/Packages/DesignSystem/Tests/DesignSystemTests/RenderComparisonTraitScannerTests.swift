import Testing

/// The rule itself, against source held in a string. What files it is
/// applied to is `RenderComparisonTraitDisciplineTests`.
@Suite("Render comparison trait discipline rules")
internal struct RenderComparisonTraitScannerTests {
    private static let localRenderHelper = """
            private static func render(_ view: some View, in scheme: ColorScheme = .light) -> Data? {
                let renderer = ImageRenderer(content: view.environment(\\.colorScheme, scheme))
                renderer.scale = 1
                guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
                    return nil
                }
                return pixels as Data
            }
        """

    @Test("a file with its own ImageRenderer that compares with != and no trait is caught")
    func plantedInequalityViolationIsCaught() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            }
            """

        let violations = RenderComparisonTraitScanner.violations(
            inSource: source, file: "planted.swift")

        #expect(violations.map(\.file) == ["planted.swift"])
    }

    @Test("a file with its own ImageRenderer comparing .light against .dark and no trait is caught")
    func plantedSchemeViolationIsCaught() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                @Test("renders differently in light and dark")
                func rendersDifferently() throws {
                    let light = try #require(render(view, in: .light))
                    let dark = try #require(render(view, in: .dark))
                    #expect(light == dark, "will be replaced once the view exists")
                }
            }
            """

        let violations = RenderComparisonTraitScanner.violations(
            inSource: source, file: "planted.swift")

        #expect(violations.map(\.file) == ["planted.swift"])
    }

    @Test("the trait declared anywhere in the file clears it, without repeating per test")
    func traitAnywhereInFileClearsEveryComparison() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                @Test("PopsButton", .requiresCompiledColorCatalog)
                func button() throws {
                    _ = try #require(render(PopsButton("Pair") {}))
                }

                @Test("two states look different")
                func statesLookDifferent() throws {
                    let a = try #require(render(view(.one)))
                    let b = try #require(render(view(.two)))
                    #expect(a != b)
                }
            }
            """

        #expect(RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty)
    }

    @Test("rendering once, or rendering twice and asserting equality, is not a comparison")
    func determinismChecksAreNotFlagged() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                @Test("renders, and renders the same way twice")
                func rendersDeterministically() throws {
                    let once = try #require(render(view))
                    let again = try #require(render(view))
                    #expect(once == again)
                }
            }
            """

        #expect(RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty)
    }

    @Test("a lone render, whatever else the test asserts, is not a comparison")
    func singleRenderIsNotFlagged() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                @Test("rasterises at all")
                func rendersOnce() throws {
                    let drawn = try #require(render(view))
                    #expect(drawn != nil)
                }
            }
            """

        #expect(RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty)
    }

    @Test("a comment reproducing the violation's shape cannot trip the scan")
    func commentsAreStripped() {
        let source = """
            @Suite("Fake rendering")
            @MainActor
            internal struct FakeRenderingTests {
            \(Self.localRenderHelper)

                // render(a) != render(b) is what a real comparison would look like.
                @Test("rasterises at all")
                func rendersOnce() throws {
                    let drawn = try #require(render(view))
                    #expect(drawn != nil)
                }
            }
            """

        #expect(RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty)
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
        let source = """
            @Suite("Fake button states")
            @MainActor
            internal struct FakeButtonTests {
                @Test("disabled renders differently from enabled")
                func disabledIsDistinct() throws {
                    let enabled = try #require(PrimitiveRenderingTests.render(PopsButton("Pair") {}))
                    let disabled = try #require(
                        PrimitiveRenderingTests.render(PopsButton("Pair") {}.disabled(true)))
                    #expect(enabled != disabled)
                }
            }
            """

        #expect(RenderComparisonTraitScanner.violations(inSource: source, file: "x.swift").isEmpty)
    }
}
