import AppCore
import DesignSystem
import SwiftUI

/// The receipt, and beside it who the purchase was from, what it came to,
/// where it stands and when.
///
/// The paper is the picture, drawn as paper with nothing around it; a
/// purchase with no receipt shows the merchant's mark in the same place, so
/// the identity never moves.
internal struct PurchaseDetailHeader: View {
    internal let detail: PurchaseDetail
    internal let open: (StagedPage) -> Void
    @ScaledMetric(relativeTo: .title) private var plateWidth = PopsSize.pageWidth * 0.75

    private var purchase: Purchase { detail.purchase }
    private var plateHeight: CGFloat { plateWidth * PopsSize.pageHeight / PopsSize.pageWidth }

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.lg) {
            picture
            identity
        }
    }

    @ViewBuilder private var picture: some View {
        if let first = detail.pages.first {
            Button {
                open(first)
            } label: {
                PopsPhoto(data: first.bytes, placeholderSymbol: first.symbolName)
                    .frame(width: plateWidth, height: plateHeight)
                    .overlay(alignment: .bottomTrailing) {
                        if detail.pages.count > 1 { pageCount }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(PurchaseDetailCopy.receiptLabel(pages: detail.pages.count))
            .accessibilityHint("Opens the receipt")
        } else {
            PurchaseMark(purchase: purchase, size: plateWidth)
        }
    }

    private var pageCount: some View {
        Label("\(detail.pages.count)", systemImage: "doc.on.doc")
            .labelStyle(.titleAndIcon)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsForeground)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .playgroundGlass(in: Capsule())
            .padding(PopsSpacing.xs)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(PurchasesPresentation.merchant(purchase))
                .font(.popsTitle)
                .foregroundStyle(
                    PurchasesPresentation.isUnattributed(purchase)
                        ? Color.popsMutedForeground : Color.popsForeground
                )
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if case .entity(_, _, let printed) = purchase.merchant {
                Text(printed)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Text(purchase.total.formatted())
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
                .padding(.vertical, PopsSpacing.xs)
            HStack(spacing: PopsSpacing.sm) {
                PurchaseStatusBadge(status: purchase.status)
                Text(purchase.orderedOn.formatted(.dateTime.day().month(.abbreviated).year()))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// What the total is made of, as figures side by side under the header.
///
/// Only the figures that are not zero, and none at all when the items are the
/// whole of the total: the total is already the largest thing on screen, and
/// restating it as a one-row breakdown says nothing.
internal struct PurchaseDetailFigures: View {
    internal let detail: PurchaseDetail
    @ScaledMetric(relativeTo: .body) private var cell = PopsSize.countField

    private var figures: [(label: String, value: String)] {
        let adjustments: [(label: String, value: String?)] = [
            ("Tax", Self.shown(detail.tax)),
            ("Delivery", Self.shown(detail.shipping)),
            ("Discount", Self.shown(detail.discount).map { "−\($0)" }),
            ("Surcharge", Self.shown(detail.surcharge)),
        ]
        let present = adjustments.compactMap { figure in
            figure.value.map { (label: figure.label, value: $0) }
        }
        guard !present.isEmpty else { return [] }
        return [("Subtotal", detail.subtotal.formatted())] + present
    }

    private static func shown(_ amount: MoneyAmount) -> String? {
        amount.minorUnits == 0 ? nil : amount.formatted()
    }

    internal var body: some View {
        let figures = figures
        if !figures.isEmpty {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    ForEach(figures, id: \.label) { cellView($0).fixedSize() }
                }
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: cell), spacing: PopsSpacing.md)],
                    alignment: .leading,
                    spacing: PopsSpacing.sm
                ) {
                    ForEach(figures, id: \.label) { cellView($0) }
                }
            }
        }
    }

    private func cellView(_ figure: (label: String, value: String)) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(figure.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(figure.value)
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The lines, as the one list on the page.
internal struct PurchaseDetailLines: View {
    internal let lines: [PurchaseDetailLine]

    internal var body: some View {
        if lines.isEmpty {
            Text("No itemised lines")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(maxWidth: .infinity)
                .padding(.top, PopsSpacing.xl)
        } else {
            List(lines) { line in
                row(line)
                    .listRowBackground(Color.popsBackground)
                    .listRowSeparator(
                        line.id == lines.first?.id ? .hidden : .automatic,
                        edges: .top
                    )
                    .listRowInsets(
                        EdgeInsets(
                            top: PopsSpacing.sm, leading: PopsSpacing.lg,
                            bottom: PopsSpacing.sm, trailing: PopsSpacing.lg))
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    /// A till line with its newlines turned into separators. The paper writes
    /// one line over three, and three rows of height per item is a list
    /// nobody scrolls.
    private func row(_ line: PurchaseDetailLine) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Text(Self.oneLine(line.name))
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(2)
            if line.quantity > 1 {
                Text("×\(line.quantity)")
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(line.lineTotal.formatted())
                .font(.popsBody)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .layoutPriority(1)
        }
        .accessibilityElement(children: .combine)
    }

    nonisolated internal static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }
}
