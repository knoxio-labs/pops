import AppCore
import DesignSystem
import SwiftUI

/// **Ledger** — the archive taken seriously.
///
/// One flat reverse-chronological run, cut into calendar months by a pinned
/// header that carries what that month came to. Settlement is an annotation
/// rather than a structure: an unmatched row gets a dot on its mark and
/// nothing else, because on this reading the history is the product and the
/// reconciliation gap is a footnote on it.
///
/// The bet: what a person asks this screen is "what did I pay at Bunnings in
/// July", and the fastest answer to that is an unbroken column in date order
/// with nothing reordering it.
internal struct PurchasesLedgerSurface: View {
    internal let purchases: [Purchase]

    private let unsettledDot: CGFloat = 10

    internal var body: some View {
        ScrollView {
            LazyVStack(
                alignment: .leading, spacing: PopsSpacing.zero, pinnedViews: [.sectionHeaders]
            ) {
                summary
                ForEach(PurchasesPresentation.byMonth(purchases), id: \.month) { group in
                    Section {
                        ForEach(group.purchases) { purchase in
                            row(purchase)
                            if purchase.id != group.purchases.last?.id { PopsDivider() }
                        }
                    } header: {
                        header(for: group)
                    }
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    /// The whole history in one line, above the first month. Counts rather
    /// than money, because a figure summing every currency on the screen is
    /// the one number this data cannot produce.
    private var summary: some View {
        let unsettled = purchases.filter(\.status.isUnsettled).count
        return HStack(spacing: PopsSpacing.xs) {
            Text("\(purchases.count) purchases")
            if unsettled > 0 {
                Text("·")
                Text("\(unsettled) unmatched")
                    .foregroundStyle(Color.popsWarning)
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .font(.popsCaption)
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.vertical, PopsSpacing.sm)
    }

    private func header(for group: (month: Date, purchases: [Purchase])) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(PurchasesPresentation.month(group.month).uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
            // Stacked rather than added together: a month holding two
            // currencies has two totals, and there is no third number.
            VStack(alignment: .trailing, spacing: PopsSpacing.zero) {
                ForEach(
                    PurchasesPresentation.totals(group.purchases), id: \.currencyCode
                ) { total in
                    Text(total.formatted())
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
        .padding(.vertical, PopsSpacing.sm)
        .background(Color.popsBackground)
    }

    private func mark(_ purchase: Purchase) -> some View {
        PurchaseMark(purchase: purchase)
            .overlay(alignment: .topTrailing) {
                if purchase.status.isUnsettled {
                    Circle()
                        .fill(Color.popsWarning)
                        .frame(width: unsettledDot, height: unsettledDot)
                        .overlay(
                            Circle().strokeBorder(
                                Color.popsBackground, lineWidth: PopsBorder.emphasis)
                        )
                        .offset(x: PopsSpacing.xs, y: -PopsSpacing.xs)
                }
            }
    }

    private func row(_ purchase: Purchase) -> some View {
        HStack(spacing: PopsSpacing.md) {
            mark(purchase)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsHeadline)
                    .foregroundStyle(
                        PurchasesPresentation.isUnattributed(purchase)
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(1)
                Text(
                    "\(PurchasesPresentation.day(purchase)) · \(PurchasesPresentation.items(purchase))"
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(purchase.total.formatted())
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.md)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            """
            \(PurchasesPresentation.merchant(purchase)), \
            \(purchase.total.formatted()), \
            \(PurchasesPresentation.day(purchase)), \
            \(PurchasesPresentation.label(for: purchase.status))
            """
        )
    }
}
