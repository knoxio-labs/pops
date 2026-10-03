import Testing

@testable import AppCore

@Suite("parseObjectURI")
internal struct ObjectURITests {
    @Test(
        "accepts a well-formed object uri",
        arguments: [
            (
                "pops:finance/transaction/1234",
                PopsURI(pillar: "finance", type: "transaction", id: "1234")
            ),
            ("pops:inventory/item/18", PopsURI(pillar: "inventory", type: "item", id: "18")),
            ("pops:media/tv-show/42", PopsURI(pillar: "media", type: "tv-show", id: "42")),
        ])
    func acceptsWellFormed(uri: String, expected: PopsURI) {
        #expect(parseObjectURI(uri) == expected)
    }

    @Test(
        "rejects a malformed object uri",
        arguments: [
            "pops:finance/transaction",
            "pops:finance//1",
            "pops:finance/transaction/a/b",
            "pops:/finance/transaction/1",
            "pops://finance/transaction/abc",
            "finance/transaction/1",
            "",
        ])
    func rejectsMalformed(uri: String) {
        #expect(parseObjectURI(uri) == nil)
    }

    @Test("the label parser stays strict about the colon form")
    func labelParserRejectsColonForm() {
        #expect(parsePopsURI("pops:finance/transaction/1") == nil)
    }
}
