import AppCore
import Testing

@Suite("ReceiptMoneyText")
internal struct ReceiptMoneyTextTests {
    @Test(
        "cents format as plain decimal text",
        arguments: [
            (1250, "12.50"),
            (5, "0.05"),
            (100, "1.00"),
            (0, "0.00"),
            (-240, "-2.40"),
            (-5, "-0.05"),
        ]
    )
    func formatting(cents: Int, expected: String) {
        #expect(ReceiptMoneyText.string(fromCents: cents) == expected)
    }

    @Test(
        "plain decimal text parses back to cents",
        arguments: [
            ("12.50", 1250),
            ("12.5", 1250),
            ("12", 1200),
            ("0.05", 5),
            ("-2.40", -240),
            ("-2", -200),
            (" 12.50 ", 1250),
        ]
    )
    func parsing(text: String, expected: Int) {
        #expect(ReceiptMoneyText.cents(from: text) == expected)
    }

    @Test(
        "anything that is not a plain decimal amount is refused, not guessed at",
        arguments: [
            "", "  ", "abc", "$12.50", "12,50", "1,234.56", "12.505", "12.", "--2", "2-", "12.5.6",
            "١٢",
        ]
    )
    func refusesUnparseable(text: String) {
        #expect(ReceiptMoneyText.cents(from: text) == nil)
    }

    @Test("formatting then parsing is the identity, across a spread of cent values")
    func roundTrips() {
        for cents in [0, 1, 99, 100, 1250, -1, -240, 999_999, -999_999] {
            let text = ReceiptMoneyText.string(fromCents: cents)
            #expect(ReceiptMoneyText.cents(from: text) == cents, "round-trip failed for \(cents)")
        }
    }
}
