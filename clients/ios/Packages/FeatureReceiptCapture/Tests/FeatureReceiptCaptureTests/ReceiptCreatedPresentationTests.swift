import AppCore
import Testing

@testable import FeatureReceiptCapture

/// What the confirmation screen says once a receipt has become a purchase.
///
/// Its own suite rather than a section of ``ReceiptResultPresentationTests``:
/// this arm is the only one drawn from a record the pillar wrote, so what it
/// has to get right — the money, the count, the date — has nothing in common
/// with the reading the other two arms present.
@Suite("Receipt result presentation — created")
internal struct ReceiptCreatedPresentationTests {
    private static let presentation = ReceiptResultPresentation()

    @Test("a fresh write and a re-upload of the same bytes read differently")
    func createdDistinguishesAlreadyStored() {
        let fresh = Self.presentation.content(
            .created(purchase: .fake(id: "purchase-1"), alreadyStored: false))
        let repeated = Self.presentation.content(
            .created(purchase: .fake(id: "purchase-1"), alreadyStored: true))

        guard case .created(let freshContent) = fresh, case .created(let repeatedContent) = repeated
        else {
            Issue.record("expected both to present as created")
            return
        }
        #expect(freshContent.message != repeatedContent.message)
        #expect(freshContent.reference.contains("purchase-1"))
        #expect(repeatedContent.reference.contains("purchase-1"))
    }

    /// The confirmation a reader checks against the paper still in their hand.
    /// A bare reference identifies the purchase and describes nothing about
    /// it, which is a screen that cannot be verified.
    @Test("the confirmation names the merchant, the item count and the total")
    func createdDrawsThePurchaseSummary() {
        let purchase = ReceiptPurchase.fake(
            merchantName: "Woolworths",
            total: MoneyAmount(minorUnits: 8420, currencyCode: "AUD"),
            itemCount: 12
        )
        let result = Self.presentation.content(.created(purchase: purchase, alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(content.summary.contains("Woolworths"))
        #expect(content.summary.contains("12 items"))
        #expect(content.summary.contains(purchase.total.formatted()))
    }

    @Test("one item is not drawn as '1 items'")
    func createdSummaryPluralisesOne() {
        let result = Self.presentation.content(
            .created(purchase: .fake(itemCount: 1), alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(content.summary.contains("1 item"))
        #expect(!content.summary.contains("1 items"))
    }

    /// A merchant the pillar could not resolve is left out rather than filled
    /// with a placeholder, and the count and total still draw — the same call
    /// the extraction table makes about a field the receipt never stated.
    @Test("an unresolved merchant leaves the rest of the summary standing")
    func createdSummaryWithoutMerchant() {
        let result = Self.presentation.content(
            .created(
                purchase: .fake(
                    merchantName: nil,
                    total: MoneyAmount(minorUnits: 199, currencyCode: "AUD"),
                    itemCount: 2
                ),
                alreadyStored: false
            )
        )

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(content.summary.contains("2 items"))
        #expect(!content.summary.hasPrefix(" ·"))
    }

    @Test("a purchase with no separate line items says nothing about a count")
    func createdSummaryWithNoItems() {
        let result = Self.presentation.content(
            .created(purchase: .fake(itemCount: 0), alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(!content.summary.contains("0 item"))
    }

    @Test("the receipt's own date is drawn, in the reader's format rather than the wire's")
    func createdDrawsTheDate() throws {
        let result = Self.presentation.content(
            .created(
                purchase: .fake(orderedAt: "2026-08-01T04:32:00.000Z"), alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        let purchasedOn = try #require(content.purchasedOn)
        #expect(!purchasedOn.contains("2026-08-01T"))
        #expect(purchasedOn.contains("2026"))
    }

    /// The producer's own pattern admits an offset as readily as `Z`, and
    /// `ISO8601DateFormatter` treats fractional seconds as a requirement
    /// rather than a permission — so both forms have to actually parse.
    @Test(
        "every timestamp shape the producer may send parses",
        arguments: [
            "2026-08-01T04:32:00.000Z",
            "2026-08-01T04:32:00Z",
            "2026-08-01T12:32:00+08:00",
        ]
    )
    func createdParsesEveryTimestampShape(orderedAt: String) {
        let result = Self.presentation.content(
            .created(purchase: .fake(orderedAt: orderedAt), alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(content.purchasedOn != nil)
    }

    /// Showing the raw string would put a machine timestamp in front of a
    /// reader; claiming a date it could not read would be worse.
    @Test("a timestamp that will not parse draws no date at all")
    func createdDropsAnUnparseableDate() {
        let result = Self.presentation.content(
            .created(purchase: .fake(orderedAt: "13/08/2026"), alreadyStored: false))

        guard case .created(let content) = result else {
            Issue.record("expected created")
            return
        }
        #expect(content.purchasedOn == nil)
        #expect(!content.accessibilityLabel.contains("13/08/2026"))
    }
}
