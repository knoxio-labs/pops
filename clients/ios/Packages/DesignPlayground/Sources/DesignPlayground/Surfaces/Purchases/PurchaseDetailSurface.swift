import AppCore
import DesignSystem
import SwiftUI

/// One line of a saved purchase, as the mobile detail route returns it.
internal struct PurchaseDetailLine: Identifiable, Hashable {
    internal let id: String
    internal let name: String
    internal let quantity: Int
    internal let lineTotal: MoneyAmount
}

/// A saved purchase, whole.
///
/// Shaped after `GET /mobile/purchases/:id` and not after the pillar's own
/// detail, which returns a great deal more. The mobile route answers with the
/// order, its five component figures, its source, and flat lines of name,
/// quantity and line total — no charges, no finance links, no shipments, no
/// documents beyond a single receipt URI, no per-line tags or units. So this
/// screen shows what a device can actually ask for, and the absences are the
/// contract's rather than the design's.
internal struct PurchaseDetail: Identifiable, Hashable {
    internal let purchase: Purchase
    internal let subtotal: MoneyAmount
    internal let tax: MoneyAmount
    internal let shipping: MoneyAmount
    internal let discount: MoneyAmount
    internal let surcharge: MoneyAmount
    internal let source: String
    internal let lines: [PurchaseDetailLine]
    internal let pages: [StagedPage]

    internal var id: String { purchase.id }
}

/// What a purchase looks like once it is saved.
///
/// The screen `purchases/home` has had nowhere to go since the digest was
/// decided, and the one POPS-2376 records as a dead end after a capture
/// succeeds.
///
/// ## It is the digest's vocabulary, one purchase down
///
/// Glass over a wash for the figure, the merchant by its entity name with the
/// printed wording demoted, the same marks and the same status badge. A detail
/// screen that invented its own idiom would make the push from the list feel
/// like arriving in another app.
///
/// ## The receipt is on it
///
/// POPS-2452 asks for the captured image to be shown and this is where it is
/// least negotiable: the whole reason the archive is worth keeping is being
/// able to look at the paper again. Tapping a page opens the same viewer
/// staging uses, so zoom and paging are the one behaviour rather than two.
///
/// ## What it does not show, and why that is the contract's fault
///
/// The accounting split — matched, awaiting import, residual — is what would
/// turn `Unmatched` from a word into a figure, and the mobile route does not
/// carry it. Nor the charges, nor which finance transaction settled it. The
/// status badge is therefore the whole of what this screen can say about
/// money moving, and saying more would mean inventing it.
internal struct PurchaseDetailSurface: View {
    internal let detail: PurchaseDetail

    @State private var viewing: StagedPage?

    private let markSize: CGFloat = 44
    private let pageWidth: CGFloat = PopsSize.pageWidth * 0.55
    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth

    private var purchase: Purchase { detail.purchase }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                hero
                if !detail.pages.isEmpty { paper }
                items
                breakdown
                provenance
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        // An inset, not an overlay. An overlay reserves nothing, so the last
        // row of the content sat underneath the controls with no way to
        // scroll past them; an inset takes the height out of the scroll's safe
        // area and the content clears it.
        .safeAreaInset(edge: .bottom) { actions }
        .playgroundStage(item: $viewing) { page in
            PurchasePageViewer(
                staged: StagedReceipts([StagedReceipt(id: detail.id, pages: detail.pages)]),
                showing: page,
                onDelete: { _ in }
            )
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.md) {
                PurchaseMark(purchase: purchase, size: markSize)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(PurchasesPresentation.merchant(purchase))
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                        .lineLimit(2)
                    // The till's own wording, under the name worth reading.
                    // Kept because it is what the pillar is searched by, and
                    // demoted because it is not what anybody calls the shop.
                    if case .entity(_, _, let printed) = purchase.merchant {
                        Text(printed)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: PopsSpacing.sm)
            }
            Text(purchase.total.formatted())
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(spacing: PopsSpacing.sm) {
                PurchaseStatusBadge(status: purchase.status)
                Text(purchase.orderedOn.formatted(date: .long, time: .omitted))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PopsSpacing.lg)
        .background(alignment: .topTrailing) { PurchaseHeroWash() }
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    private var paper: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(
                title: "The receipt",
                note: detail.pages.count == 1 ? nil : "\(detail.pages.count) pages")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PopsSpacing.md) {
                    ForEach(detail.pages) { page in
                        Button {
                            viewing = page
                        } label: {
                            PopsPhoto(data: page.bytes, placeholderSymbol: page.symbolName)
                                .frame(width: pageWidth, height: pageWidth * ratio)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        }
    }

    private var items: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(
                title: "Items", note: PurchasesPresentation.items(purchase))
            if detail.lines.isEmpty {
                Text("The reading found no itemised lines on this receipt.")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .padding(PopsSpacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            } else {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(detail.lines) { line in
                        lineRow(line)
                        if line.id != detail.lines.last?.id { PopsDivider() }
                    }
                }
                .padding(.horizontal, PopsSpacing.md)
                .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            }
        }
    }

    /// A till line, with its newlines turned into separators. The paper writes
    /// one line over three — a code, a description, `Price: open` — and three
    /// rows' worth of height per item is a list nobody scrolls.
    private func lineRow(_ line: PurchaseDetailLine) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Text(Self.oneLine(line.name))
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(2)
            if line.quantity > 1 {
                Text("×\(line.quantity)")
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(line.lineTotal.formatted())
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.md)
    }

    private static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }

    private var breakdown: some View {
        PurchaseBreakdown(detail: detail)
    }

    /// Where the record came from. Last, small, and monospaced where it is an
    /// identifier: it describes nothing about the purchase and is the one
    /// thing on the screen nobody has to read.
    private var provenance: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            DigestSectionLabel(title: "Where this came from")
            HStack(spacing: PopsSpacing.sm) {
                Text(detail.source)
                    .font(.popsMonospacedCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                if purchase.receiptURI != nil {
                    Text("· receipt stored")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.zero)
            }
        }
    }

    /// Edit opens the same form the review step uses, which is POPS-2458 and
    /// the reason this screen has to exist before that one can.
    private var actions: some View {
        Button {
        } label: {
            Label("Edit", systemImage: "pencil")
                .font(.popsHeadline)
                .padding(.horizontal, PopsSpacing.md)
                .padding(.vertical, PopsSpacing.xs)
        }
        .playgroundProminentGlassButton()
        .padding(.bottom, PopsSpacing.lg)
    }
}
