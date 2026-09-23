import DesignSystem
import SwiftUI

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
                    .popsProminentGlassButton()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .navigationTitle("")
        .popsTitleDisplay(large: false)
    }
}

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
        .popsTitleDisplay(large: false)
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
