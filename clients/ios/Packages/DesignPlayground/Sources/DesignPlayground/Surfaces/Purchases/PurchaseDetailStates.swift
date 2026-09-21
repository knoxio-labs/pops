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

/// The page before its purchase has arrived: the same blocks at the same
/// sizes with nothing in them, shimmering. Never a spinner, so nothing jumps
/// when the answer lands.
internal struct PurchaseDetailSkeleton: View {
    @ScaledMetric(relativeTo: .title) private var plateWidth = PopsSize.pageWidth * 0.75
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            HStack(alignment: .top, spacing: PopsSpacing.lg) {
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(
                        width: plateWidth,
                        height: plateWidth * PopsSize.pageHeight / PopsSize.pageWidth)
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    bar(0.7)
                    bar(0.45)
                    bar(0.6)
                    bar(0.5)
                }
            }
            bar(0.25)
            ForEach(0..<4, id: \.self) { _ in bar(1) }
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

    private func bar(_ widthFraction: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * widthFraction)
        }
        .frame(height: line)
    }
}
