import Testing

@testable import DesignPlayground

/// The tab bar is the one place this package restates something the app also
/// states, and POPS-2976 is what that costs: after POPS-2893 gave every
/// feature a name and a glyph of its own, this package still drew `purchases`
/// under its raw id and the generic fallback square, and nothing said so.
///
/// These assertions are about the shape of the answer rather than its letters.
/// Asserting the literal "Purchases" would only restate the restatement; what
/// is worth catching is a tab that has fallen back — to its id, or to the
/// glyph a build shows for a feature it has never heard of.
@Suite("Shell tabs are named, not id'd")
internal struct ShellTabTests {
    @Test("no tab is labelled with its own feature id")
    func everyTabHasARealName() {
        for tab in shellTabs {
            #expect(
                tab.label != tab.id,
                Comment(rawValue: "tab \(tab.id) is labelled with its own id")
            )
        }
    }

    /// `RootCopy.symbol(for:)` returns `square.grid.2x2` for a feature this
    /// build has no module for. Every tab here has a module, so none of them
    /// may draw it.
    @Test("no tab draws the unknown-feature fallback glyph")
    func everyTabHasItsOwnSymbol() {
        for tab in shellTabs {
            #expect(
                tab.symbol != "square.grid.2x2",
                Comment(rawValue: "tab \(tab.id) draws the fallback glyph")
            )
        }
    }

    /// The sentence the app composes per withheld feature runs the feature's
    /// name through `RootCopy.name(of:)`, so a withheld feature is named the
    /// way its tab is named. A raw id here reads as a typo to anyone reviewing
    /// the surface.
    @Test("the withheld-feature sentence names features rather than ids")
    func nothingUsableNamesFeatures() {
        #expect(ShellCopy.nothingUsable.contains("Transactions needs a newer version of this app."))
        #expect(ShellCopy.nothingUsable.contains("Purchases is not available right now."))
    }
}
