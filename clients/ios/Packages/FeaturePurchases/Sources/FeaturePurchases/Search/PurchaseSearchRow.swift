import AppCore
import DesignSystem
import SwiftUI

/// A purchases search hit in Inventory's row idiom: mark, highlighted name
/// over one detail line, the amount, the chevron. A purchase leads with its
/// merchant's mark; a line leads with the barcode glyph and names the order
/// it is on. What matched, when it is not the name, shows on a line of its
/// own. A tap always opens the order the hit belongs to — a line's route is
/// its order's id, not the line's.
public struct PurchaseSearchRow: View {
    public let hit: PurchaseSearchHit
    public var query = ""
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    public init(hit: PurchaseSearchHit, query: String = "") {
        self.hit = hit
        self.query = query
    }

    public var body: some View {
        NavigationLink(value: PurchaseSearchRowContent.route(for: hit)) {
            HStack(spacing: PopsSpacing.md) {
                mark
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(highlightedName)
                        .font(.popsHeadline)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(PurchaseSearchRowContent.detailText(for: hit))
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
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, PopsSpacing.xs)
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var mark: some View {
        switch hit {
        case .purchase(let order, _):
            PurchaseMark(merchant: order.merchant, size: markSize)
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
        case .purchase(let order, _): order.total
        case .line(_, _, _, let lineTotal, _, _): lineTotal
        }
    }

    @ViewBuilder private var matchLine: some View {
        switch hit {
        case .purchase(_, let printed?):
            PurchaseSearchMatchLine(symbol: "receipt", text: printed, query: query)
        case .line(_, _, _, _, _, let tag?):
            PurchaseSearchMatchLine(symbol: "tag", text: tag, query: query)
        case .purchase, .line:
            EmptyView()
        }
    }

    private var highlightedName: AttributedString {
        PurchaseSearchRowContent.highlighted(
            PurchaseSearchRowContent.name(for: hit), query: query, base: Color.popsForeground)
    }
}

/// The wording a hit matched on when it is not the row's name: the receipt's
/// own wording for a purchase, or the tag that matched for a line.
private struct PurchaseSearchMatchLine: View {
    let symbol: String
    let text: String
    let query: String

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
        PurchaseSearchRowContent.highlighted(text, query: query, base: Color.popsMutedForeground)
    }
}

/// The row's testable logic, kept off the view's own type so it runs free of
/// `View`'s implied main-actor isolation.
internal enum PurchaseSearchRowContent {
    /// The purchase a tap opens: the order itself, or the order a line is on.
    internal static func route(for hit: PurchaseSearchHit) -> PurchasesRoute {
        .detail(hit.order.id)
    }

    /// The row's name: the merchant for a purchase, the till's product name
    /// folded to one line for a line.
    internal static func name(for hit: PurchaseSearchHit) -> String {
        switch hit {
        case .purchase(let order, _):
            order.merchant.displayName ?? "Merchant not recognised"
        case .line(_, let name, _, _, _, _):
            oneLine(name)
        }
    }

    /// The line under the name: the day for a purchase; the line's quantity,
    /// its order's merchant and the day for a line.
    internal static func detailText(for hit: PurchaseSearchHit) -> String {
        switch hit {
        case .purchase(let order, _):
            PurchasesPresentation.day(of: order.orderedOn)
        case .line(_, _, let quantity, _, let order, _):
            "×\(quantity) · \(order.merchant.displayName ?? "Merchant not recognised") · "
                + PurchasesPresentation.day(of: order.orderedOn)
        }
    }

    /// A till name folded to one line: each newline-separated segment
    /// trimmed and joined with a middle dot, so a wrapped product name reads
    /// as one row instead of pushing the row's other fields down.
    internal static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }

    /// `text` with every occurrence of `query` drawn in the feature's tint —
    /// the same `.popsPurchases` colour every screen in this package sets
    /// with `.tint(.popsPurchases)` — and every other character in `base`.
    internal static func highlighted(
        _ text: String, query: String, base: Color
    ) -> AttributedString {
        var attributed = AttributedString(text)
        attributed.foregroundColor = base
        for range in matchRanges(of: query, in: text) {
            if let lower = AttributedString.Index(range.lowerBound, within: attributed),
                let upper = AttributedString.Index(range.upperBound, within: attributed)
            {
                attributed[lower..<upper].foregroundColor = Color.popsPurchases
            }
        }
        return attributed
    }

    /// Every case-insensitive occurrence of `query` in `text`. An empty or
    /// all-whitespace query matches nothing.
    internal static func matchRanges(of query: String, in text: String) -> [Range<String.Index>] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        var ranges: [Range<String.Index>] = []
        var start = text.startIndex
        while let found = text.range(
            of: trimmed, options: .caseInsensitive, range: start..<text.endIndex)
        {
            ranges.append(found)
            start = found.upperBound
        }
        return ranges
    }
}
