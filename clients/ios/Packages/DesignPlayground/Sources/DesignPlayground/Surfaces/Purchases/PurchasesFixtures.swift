import AppCore
import Foundation

/// Fictional purchases, typed against ``Purchase`` — mirroring
/// `pillars/design/src/fixtures/purchases.ts`, including the row with no
/// merchant name: the pillar could not resolve one, and the row says so
/// itself rather than this fixture inventing a name.
internal enum PurchasesFixtures {
    private static func date(_ interval: TimeInterval) -> Date {
        Date(timeIntervalSince1970: interval)
    }

    static let all: [Purchase] = [
        Purchase(
            id: "pur-woolworths",
            merchantName: "Woolworths Metro",
            orderedOn: date(1_788_393_600),
            total: Fixtures.money(8_423),
            itemCount: 12,
            receiptURI: "pops://receipts/r1"
        ),
        Purchase(
            id: "pur-kmart",
            merchantName: "Kmart",
            orderedOn: date(1_788_220_800),
            total: Fixtures.money(1_999),
            itemCount: 3,
            receiptURI: nil
        ),
        Purchase(
            id: "pur-bunnings",
            merchantName: "Bunnings Warehouse",
            orderedOn: date(1_788_048_000),
            total: Fixtures.money(15_600),
            itemCount: 7,
            receiptURI: "pops://receipts/r2"
        ),
        Purchase(
            id: "pur-unresolved",
            merchantName: nil,
            orderedOn: date(1_787_875_200),
            total: Fixtures.money(4_250),
            itemCount: 1,
            receiptURI: nil
        ),
        Purchase(
            id: "pur-coffee",
            merchantName: "Sample Coffee",
            orderedOn: date(1_787_788_800),
            total: Fixtures.money(540),
            itemCount: 1,
            receiptURI: nil
        ),
    ]
}
