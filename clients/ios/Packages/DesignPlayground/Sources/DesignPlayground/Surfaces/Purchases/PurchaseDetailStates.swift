import AppCore
import DesignSystem
import SwiftUI

/// The words the detail's own states use.
internal enum PurchaseDetailCopy {
    internal static func symbol(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "wifi.slash"
        case .unreachable: "exclamationmark.icloud"
        case .notFound: "doc.questionmark"
        case .unauthorized: "lock"
        case .contractMismatch: "arrow.down.app"
        }
    }

    internal static func title(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "Offline"
        case .unreachable: "Purchases didn't answer"
        case .notFound: "Purchase not found"
        case .unauthorized: "No access to purchases"
        case .contractMismatch: "Update Pops"
        }
    }

    internal static func message(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "It opens once this phone is back online."
        case .unreachable: "Nothing was lost."
        case .notFound: "It may have been deleted."
        case .unauthorized: "This phone's key doesn't include Purchases."
        case .contractMismatch: "This version can't read this purchase."
        }
    }

    /// Whether trying again can change the answer. A missing record, a
    /// refused scope and an old build all answer the same way twice.
    internal static func isRetryable(_ failure: PurchaseDetailFailure) -> Bool {
        switch failure {
        case .offline, .unreachable: true
        case .notFound, .unauthorized, .contractMismatch: false
        }
    }

    /// The same failure as one line over a purchase already on screen.
    internal static func refreshNotice(for failure: PurchaseDetailFailure) -> String {
        switch failure {
        case .offline: "Offline, showing the saved copy"
        case .unreachable: "Couldn't refresh"
        case .notFound: "Deleted elsewhere"
        case .unauthorized: "No longer allowed to refresh"
        case .contractMismatch: "Update Pops to refresh"
        }
    }

    internal static func edited(_ date: Date) -> String {
        "Edited \(date.formatted(.dateTime.day().month(.abbreviated)))"
    }

    internal static func receiptLabel(pages: Int) -> String {
        pages == 1 ? "Receipt" : "Receipt, \(pages) pages"
    }

    internal static func day(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year())
    }

    /// The currency's code, beside a total priced in something other than
    /// the reader's own currency. A locale that writes both as `$` would
    /// otherwise show US dollars as if they were the reader's.
    internal static func foreignCurrency(
        _ amount: MoneyAmount, locale: Locale = .autoupdatingCurrent
    ) -> String? {
        guard let home = locale.currency?.identifier, home != amount.currencyCode else {
            return nil
        }
        return amount.currencyCode
    }

    /// The till's own wording under a resolved merchant's name. Nothing when
    /// the name on screen already is that wording, or says the same thing.
    internal static func printed(_ merchant: MerchantIdentity) -> String? {
        guard case .entity(_, let name, let printed) = merchant,
            printed.compare(name, options: [.caseInsensitive, .diacriticInsensitive])
                != .orderedSame
        else { return nil }
        return printed
    }

    /// The bank match in words, read from the reader's side.
    internal static func match(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "Awaiting a bank match"
        case .linked: "Matched to the bank"
        case .partial: "Part matched to the bank"
        case .settledCash: "Paid in cash"
        case .ignored: "Left out of matching"
        case .unrecognised(let raw): raw.prefix(1).uppercased() + raw.dropFirst()
        }
    }

    internal static func matchSymbol(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "clock"
        case .linked: "checkmark"
        case .partial: "circle.lefthalf.filled"
        case .settledCash: "banknote"
        case .ignored: "minus"
        case .unrecognised: "questionmark"
        }
    }

    /// What Share hands on: who, when, what it came to, and the lines.
    @MainActor
    internal static func shareText(_ detail: PurchaseDetail) -> String {
        let purchase = detail.purchase
        let head = [
            PurchasesPresentation.merchant(purchase),
            day(purchase.orderedOn),
            purchase.total.formatted(),
        ]
        let lines = detail.lines.map {
            "\(PurchaseDetailLineText.oneLine($0.name))  \($0.lineTotal.formatted())"
        }
        return (head + (lines.isEmpty ? [] : [""] + lines)).joined(separator: "\n")
    }
}

/// A fetch that failed with nothing to show, in the system's own
/// unavailable-content view. One glyph, a title, one line, and Retry only
/// where retrying can help.
internal struct PurchaseDetailFailureView: View {
    internal let failure: PurchaseDetailFailure
    internal let retry: () -> Void

    internal var body: some View {
        ContentUnavailableView {
            Label(
                PurchaseDetailCopy.title(for: failure),
                systemImage: PurchaseDetailCopy.symbol(for: failure))
        } description: {
            Text(PurchaseDetailCopy.message(for: failure))
        } actions: {
            if PurchaseDetailCopy.isRetryable(failure) {
                Button("Retry", action: retry)
                    .playgroundProminentGlassButton()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
    }
}

/// The page before its purchase has arrived: the header, the match row and
/// the receipt panel at their loaded sizes with nothing in them, shimmering.
/// Never a spinner, so nothing jumps when the answer lands.
internal struct PurchaseDetailSkeleton: View {
    @ScaledMetric(relativeTo: .title) private var markSize = PopsSize.touchTarget + PopsSpacing.sm
    @ScaledMetric(relativeTo: .title) private var plateWidth = PopsSize.pageWidth * 0.55
    @ScaledMetric(relativeTo: .largeTitle) private var amount = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var row = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            HStack(alignment: .top, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        block(width: markSize, height: markSize)
                        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                            bar(0.8)
                            bar(0.55)
                        }
                    }
                    bar(0.55, height: amount)
                }
                block(
                    width: plateWidth, height: plateWidth * PopsSize.pageHeight / PopsSize.pageWidth
                )
            }
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .fill(Color.popsSurface)
                .frame(height: row + PopsSpacing.lg)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                bar(0.2)
                RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(height: row * 3 + PopsSpacing.lg)
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .popsShimmer()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.popsBackground)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
    }

    private func block(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
            .fill(Color.popsSurface)
            .frame(width: width, height: height)
    }

    private func bar(_ widthFraction: CGFloat, height: CGFloat? = nil) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * widthFraction)
        }
        .frame(height: height ?? line)
    }
}
