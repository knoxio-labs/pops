/// Source held in a string, for the two suites that exercise
/// `RenderComparisonTraitScanner` against shapes the real tree does not have.
///
/// A file of its own so both suites build their fixtures the same way — and
/// because these literals reproduce a violation exactly, which is why this
/// file is named in `RenderComparisonTraitDisciplineTests.ownFiles` alongside
/// them.
internal enum RenderComparisonTraitFixtures {
    /// The rasterising helper every real rendering suite here declares, under
    /// whichever name the caller wants to test the scan against.
    static func helper(named name: String = "render") -> String {
        """
            private static func \(name)(_ view: some View, in scheme: ColorScheme = .light) -> Data? {
                let renderer = ImageRenderer(content: view.environment(\\.colorScheme, scheme))
                renderer.scale = 1
                guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
                    return nil
                }
                return pixels as Data
            }
        """
    }

    /// A suite around `body`, with the stock helper and whatever suite-level
    /// traits the caller wants.
    static func suite(_ body: String, traits: String = "") -> String {
        """
        @Suite("Fake rendering"\(traits))
        @MainActor
        internal struct FakeRenderingTests {
        \(helper())

        \(body)
        }
        """
    }

    /// A suite around `body` with no helper at all, for the shapes that build
    /// their renderer inline or borrow someone else's.
    static func bareSuite(_ body: String) -> String {
        """
        @Suite("Fake rendering")
        @MainActor
        internal struct FakeRenderingTests {
        \(body)
        }
        """
    }
}
