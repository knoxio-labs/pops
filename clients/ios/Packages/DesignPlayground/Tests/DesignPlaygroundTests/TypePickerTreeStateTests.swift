import Testing

@testable import DesignPlayground

@Suite("Type picker tree state")
@MainActor
internal struct TypePickerTreeStateTests {
    @Test("outline mode flattens expanded branches and preserves descendant expansion")
    func outlineExpansion() {
        let state = TypePickerTreeState(mode: .outline)

        state.toggle("home-textiles")
        state.toggle("bedding")
        state.toggle("pillows-cushions")

        #expect(
            Array(state.rows.map(\.id).prefix(15)) == [
                "book", "furniture", "home-textiles", "textile-soft-furnishing", "towel",
                "bedding", "sheet", "quilt", "quilt-cover", "blanket", "mattress-protector",
                "pillows-cushions", "pillows", "cushions", "electrical-electronics",
            ])
        #expect(state.rows.first(where: { $0.id == "sheet" })?.depth == 3)

        state.toggle("home-textiles")
        #expect(!state.rows.map(\.id).contains("bedding"))
        #expect(state.expandedIDs.contains("bedding"))
        #expect(state.expandedIDs.contains("pillows-cushions"))

        state.toggle("home-textiles")
        #expect(state.rows.first(where: { $0.id == "bedding" })?.isExpanded == true)
        #expect(state.rows.map(\.id).contains("pillows"))
    }

    @Test("separate branches can remain expanded together")
    func multipleBranches() {
        let state = TypePickerTreeState(mode: .outline)

        state.toggle("home-textiles")
        state.toggle("electrical-electronics")

        #expect(state.rows.map(\.id).contains("bedding"))
        #expect(state.rows.map(\.id).contains("charger"))
        #expect(state.expandedIDs == ["home-textiles", "electrical-electronics"])
    }

    @Test("the cushion path follows the real taxonomy")
    func cushionPath() {
        let state = TypePickerTreeState(mode: .outline)

        state.toggle("home-textiles")
        state.toggle("pillows-cushions")
        state.toggle("cushions")

        let cushion = state.rows.first { $0.id == "cushion" }
        #expect(cushion?.depth == 4)
        #expect(cushion?.hasChildren == false)
        let rowIDs = Set(state.rows.map(\.id))
        #expect(["pillows-cushions", "cushions", "cushion"].allSatisfy(rowIDs.contains))
    }

    @Test("automatic mode advances the focus and breadcrumbs can restore an ancestor")
    func automaticFocus() {
        let state = TypePickerTreeState(mode: .automatic)

        state.toggle("home-textiles")
        state.toggle("pillows-cushions")

        #expect(state.focusID == "home-textiles")
        #expect(state.breadcrumbs.map(\.id) == ["item", "home-textiles"])
        #expect(!state.rows.map(\.id).contains("book"))
        #expect(state.rows.map(\.id).contains("pillows-cushions"))
        #expect(state.rows.map(\.id).contains("bedding"))
        #expect(state.rows.map(\.depth).max() == 2)

        state.goTo("item")
        #expect(state.focusID == "item")
        #expect(state.expandedIDs.contains("pillows-cushions"))
        #expect(state.rows.map(\.id).contains("book"))
        #expect(state.rows.map(\.id).contains("electrical-electronics"))
    }

    @Test("an expansion hidden by a wider breadcrumb reopens in one action")
    func automaticHiddenExpansion() {
        let state = TypePickerTreeState(mode: .automatic)

        state.toggle("home-textiles")
        state.toggle("pillows-cushions")
        state.toggle("cushions")
        #expect(state.focusID == "pillows-cushions")

        state.goTo("item")
        let hiddenExpansion = state.rows.first { $0.id == "pillows-cushions" }
        #expect(hiddenExpansion?.isExpanded == false)
        #expect(state.expandedIDs.contains("pillows-cushions"))

        state.toggle("pillows-cushions")
        #expect(state.focusID == "home-textiles")
        #expect(state.rows.first(where: { $0.id == "pillows-cushions" })?.isExpanded == true)
        #expect(state.rows.map(\.id).contains("cushions"))
    }

    @Test("manual mode changes focus only on an explicit request")
    func manualFocus() {
        let state = TypePickerTreeState(mode: .manual)

        state.toggle("home-textiles")
        state.toggle("pillows-cushions")
        #expect(state.focusID == "item")

        state.focus("pillows-cushions")
        #expect(state.focusID == "pillows-cushions")
        #expect(state.expandedIDs.contains("pillows-cushions"))
        #expect(state.breadcrumbs.map(\.id) == ["item", "home-textiles", "pillows-cushions"])
        #expect(state.rows.map(\.id) == ["pillows", "cushions"])

        state.goTo("home-textiles")
        #expect(state.focusID == "home-textiles")
        state.resetFocus()
        #expect(state.focusID == "item")
    }

    @Test("unknown identifiers and leaves cannot change navigation state")
    func invalidNavigation() {
        let state = TypePickerTreeState(mode: .manual)

        state.toggle("future-type")
        state.toggle("book")
        state.focus("future-type")
        state.focus("book")
        state.goTo("home-textiles")

        #expect(state.focusID == "item")
        #expect(state.expandedIDs.isEmpty)
        #expect(state.breadcrumbs.map(\.id) == ["item"])
    }
}
