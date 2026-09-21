import AppCore
import DesignSystem
import SwiftUI

extension PurchasesHomeView {
    /// The two ways into the archive, side by side as Inventory's browse
    /// tiles are. Unmatched leaves when there is nothing to count, and All
    /// takes the row.
    @ViewBuilder internal func tiles(_ digest: PurchasesHomeDigest) -> some View {
        let layout =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: PopsSpacing.sm))
            : AnyLayout(HStackLayout(spacing: PopsSpacing.sm))
        layout {
            if !digest.unmatched.isEmpty {
                NavigationLink {
                    PurchasesArchiveView(loaded: digest.purchases, paging: .end, scope: .unmatched)
                } label: {
                    // Three marks where the tile has the width, two where it does
                    // not, rather than cutting the word they stand beside.
                    ViewThatFits(in: .horizontal) {
                        unmatchedTile(digest, marks: 3)
                        unmatchedTile(digest, marks: 2)
                    }
                }
                .buttonStyle(.plain)
                .transition(InventoryMotion.row)
            }
            NavigationLink {
                PurchasesArchiveView(loaded: digest.purchases, paging: .end)
            } label: {
                PurchasesHomeTile(count: digest.purchases.count, title: "All purchases") {
                    PurchasesTileSymbol(symbol: "tray.full")
                }
            }
            .buttonStyle(.plain)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func unmatchedTile(_ digest: PurchasesHomeDigest, marks: Int) -> some View {
        PurchasesHomeTile(count: digest.unmatched.count, title: "Unmatched") {
            PurchaseMarkStack(purchases: Array(digest.unmatched.prefix(marks)))
        }
    }

    internal func lists(_ digest: PurchasesHomeDigest) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Picker("Show", selection: $list) {
                ForEach(PurchasesHomeList.allCases) { list in
                    Text(list.title).tag(list)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            switch list {
            case .recent:
                recent(digest.recent)
                    .transition(.opacity)
            case .leaders:
                leaders(digest)
                    .transition(.opacity)
            }
        }
    }

    private func recent(_ rows: [Purchase]) -> some View {
        PurchaseRowsPanel(rows: rows) { purchase in
            NavigationLink {
                PurchaseDetailSurface(detail: PurchaseDetailSurfaces.sample(for: purchase))
            } label: {
                if purchase.id == highlighted {
                    PurchaseRowLabel(
                        mark: purchase,
                        title: PurchasesPresentation.merchant(purchase),
                        detail: "\(PurchasesPresentation.day(purchase)) · Just saved",
                        amount: purchase.total)
                } else {
                    PurchaseRowLabel(purchase: purchase)
                }
            }
            .buttonStyle(.plain)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .fill(Color.popsPurchases.opacity(purchase.id == highlighted ? 0.16 : 0))
                    .padding(.horizontal, -PopsSpacing.sm)
            }
        }
    }

    @ViewBuilder private func leaders(_ digest: PurchasesHomeDigest) -> some View {
        if digest.leaders.isEmpty {
            InventoryCentredLine(text: "No merchant recognised this month")
        } else {
            PurchaseRowsPanel(rows: digest.leaders) { leader in
                PurchaseRowLabel(
                    mark: leader.sample,
                    title: leader.name,
                    detail: leader.purchases == 1
                        ? PurchasesPresentation.day(leader.sample)
                        : "\(leader.purchases) purchases",
                    amount: leader.total,
                    opens: false)
            }
        }
    }
}

/// One of the home's two archive tiles: what it counts, drawn as imagery,
/// then the count over its name.
internal struct PurchasesHomeTile<Mark: View>: View {
    internal let count: Int
    internal let title: String
    @ViewBuilder internal let mark: () -> Mark

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            mark()
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(count)")
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .contentTransition(.numericText(value: Double(count)))
                Text(title)
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

/// A glyph in a tinted circle, as Inventory's browse tiles mark themselves.
internal struct PurchasesTileSymbol: View {
    internal let symbol: String
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsPurchases)
            .frame(width: size, height: size)
            .background(Color.popsPurchases.opacity(0.14), in: .circle)
            .accessibilityHidden(true)
    }
}

/// The open purchases' marks, overlapping with the first on top, so the tile
/// shows whose they are before it says how many.
internal struct PurchaseMarkStack: View {
    internal let purchases: [Purchase]
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget - PopsSpacing.md

    internal var body: some View {
        HStack(spacing: -size / 3) {
            ForEach(Array(purchases.enumerated()), id: \.element.id) { index, purchase in
                PurchaseMark(purchase: purchase, size: size)
                    .overlay(
                        RoundedRectangle(cornerRadius: PopsRadius.control)
                            .strokeBorder(Color.popsBackground, lineWidth: PopsBorder.emphasis)
                    )
                    .zIndex(Double(-index))
            }
        }
        .accessibilityHidden(true)
    }
}
