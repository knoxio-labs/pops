import AppCore
import DesignSystem
import SwiftUI

/// Where a purchases hit opens: the purchase, which for a line is the order
/// the line is on.
internal enum SearchRoute: Hashable {
    case purchase(String)
}

/// A purchases hit in Inventory's row idiom: mark, highlighted name over one
/// detail line, the amount, the chevron. A purchase leads with its merchant's
/// mark; a line leads with the barcode glyph and names the order it is on.
/// What matched, when it is not the name, shows on a line of its own, the way
/// Inventory shows a matched code.
internal struct PurchaseSearchRow: View {
    internal let hit: PurchaseSearchHit
    internal var query = ""
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: SearchRoute.purchase(hit.order.id)) {
            HStack(spacing: PopsSpacing.md) {
                mark
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryHighlightedName(
                        name: hit.name.isEmpty
                            ? PurchasesPresentation.merchant(hit.order) : hit.name,
                        query: query)
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    matchLine
                }
                Spacer(minLength: PopsSpacing.sm)
                Text(amount.formatted())
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .layoutPriority(1)
                InventoryRowChevron()
            }
            .padding(.vertical, PopsSpacing.xs)
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var mark: some View {
        switch hit {
        case .purchase(let purchase, _):
            PurchaseMark(purchase: purchase, size: markSize)
        case .line:
            Image(systemName: "barcode")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
        }
    }

    private var amount: MoneyAmount {
        switch hit {
        case .purchase(let purchase, _): purchase.total
        case .line(let line, _, _): line.lineTotal
        }
    }

    private var detail: String {
        switch hit {
        case .purchase(let purchase, _):
            "\(PurchasesPresentation.items(purchase)) · \(PurchasesPresentation.day(purchase))"
        case .line(let line, let order, _):
            "×\(line.quantity) · \(PurchasesPresentation.merchant(order)) · "
                + PurchasesPresentation.day(order)
        }
    }

    @ViewBuilder private var matchLine: some View {
        switch hit {
        case .purchase(_, let printed?):
            PurchaseMatchLine(symbol: "receipt", text: printed, query: query)
        case .line(_, _, let tag?):
            PurchaseMatchLine(symbol: "tag", text: tag, query: query)
        case .purchase, .line:
            EmptyView()
        }
    }
}

/// The wording a hit matched on when it is not the row's name, the till's
/// merchant line, or a tag, with the query highlighted in it.
private struct PurchaseMatchLine: View {
    let symbol: String
    let text: String
    let query: String
    @Environment(\.inventoryAccent) private var accent

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.xs) {
            Image(systemName: symbol)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(highlighted)
                .font(.popsCaption)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Matched \(text)")
    }

    private var highlighted: AttributedString {
        var attributed = AttributedString(text)
        attributed.foregroundColor = Color.popsMutedForeground
        for range in InventorySearchRanking.highlights(of: query, in: text) {
            if let lower = AttributedString.Index(range.lowerBound, within: attributed),
                let upper = AttributedString.Index(range.upperBound, within: attributed)
            {
                attributed[lower..<upper].foregroundColor = accent
            }
        }
        return attributed
    }
}
