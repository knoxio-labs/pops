import AppCore
import DesignSystem
import Foundation
import SwiftUI

/// **Paper** — the receipt leads, and the name is commentary.
///
/// Every row opens with the photograph the purchase was read off, at the
/// proportions a till receipt actually has. The merchant name sits beside it
/// rather than in front of it, because on this data the name is the least
/// reliable thing on the row — `K mart`, `TONGLI SUPERMARKET`, and two in five
/// resolving to nothing at all — while the paper is unmistakable.
///
/// This is the variant that takes POPS-2452's "must show the captured receipt
/// image" at the list rather than only at the detail, and it argues against
/// leading with a merchant mark. A row whose purchase has no receipt draws
/// `PopsPhoto`'s empty plate, which is the honest answer and also the cost:
/// the cash and card-feed purchases that never had paper are the dullest rows
/// on a screen built around paper.
///
/// One real cost, stated rather than hidden: `PopsPhoto` decodes on every body
/// evaluation, and its own documentation says a scrolling list wants a decoded
/// image handed in and cached instead. Fourteen fixtures are affordable; a
/// shipped version of this variant needs that other initialiser first.
internal struct PurchasesPaperSurface: View {
    internal let purchases: [Purchase]

    /// Narrower than `PopsSize.pageWidth`, which is the size a page is drawn
    /// at when the page is the subject. Here it is the row's leading element,
    /// so it is derived from that token rather than being a second opinion
    /// about how big a receipt is.
    private var plateWidth: CGFloat { PopsSize.pageWidth * plateScale }
    private var plateHeight: CGFloat { PopsSize.pageHeight * plateScale }
    private let plateScale: CGFloat = 0.42

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(Array(purchases.enumerated()), id: \.element.id) { index, purchase in
                    row(purchase, paper: paper(index))
                    if purchase.id != purchases.last?.id { PopsDivider() }
                }
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    /// A distinct drawing per row, reusing the receipts area's own synthesised
    /// paper so the two surfaces show the same kind of artefact rather than
    /// two different inventions of one.
    private static let sheets: [Data] = ReceiptPlaygroundPaper
        .pages(ReceiptPart.maxPerReceipt)
        .map(\.data)

    private func paper(_ index: Int) -> Data? {
        guard !Self.sheets.isEmpty else { return nil }
        return Self.sheets[index % Self.sheets.count]
    }

    private func row(_ purchase: Purchase, paper: Data?) -> some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            PopsPhoto(
                data: purchase.receiptURI == nil ? nil : paper,
                placeholderSymbol: "banknote"
            )
            .frame(width: plateWidth, height: plateHeight)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsHeadline)
                    .foregroundStyle(
                        PurchasesPresentation.isUnattributed(purchase)
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(
                    "\(PurchasesPresentation.day(purchase)) · \(PurchasesPresentation.items(purchase))"
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                Text(purchase.total.formatted())
                    .font(.popsTitle)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                PurchaseStatusBadge(status: purchase.status)
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(.vertical, PopsSpacing.md)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            """
            \(PurchasesPresentation.merchant(purchase)), \
            \(purchase.total.formatted()), \
            \(PurchasesPresentation.day(purchase)), \
            \(PurchasesPresentation.label(for: purchase.status)), \
            \(purchase.receiptURI == nil ? "no receipt" : "receipt attached")
            """
        )
    }
}
