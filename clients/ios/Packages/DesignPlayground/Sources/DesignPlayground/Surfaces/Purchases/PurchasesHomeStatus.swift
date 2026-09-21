import DesignSystem
import SwiftUI

/// The home before its one read has answered: the figure, the two tiles, the
/// segmented control and four rows as blank shapes at their loaded sizes, so
/// nothing moves when the content lands. One skeleton, not one per band,
/// because every band comes from the same answer.
internal struct PurchasesHomeSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var figureHeight = PopsSize.touchTarget * 3
    @ScaledMetric(relativeTo: .body) private var tileHeight = PopsSize.touchTarget * 1.6
    @ScaledMetric(relativeTo: .body) private var controlHeight = PopsSize.touchTarget * 0.75
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                block(height: figureHeight, radius: PopsRadius.card)
                HStack(spacing: PopsSpacing.sm) {
                    block(height: tileHeight, radius: PopsRadius.card)
                    block(height: tileHeight, radius: PopsRadius.card)
                }
                VStack(spacing: PopsSpacing.sm) {
                    Capsule().fill(Color.popsSurface).frame(height: controlHeight)
                    ForEach(0..<PurchasesHomeDigest.recentLimit, id: \.self) { _ in
                        block(height: rowHeight, radius: PopsRadius.control)
                    }
                }
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading purchases")
    }

    private func block(height: CGFloat, radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.popsSurface)
            .frame(height: height)
    }
}

/// A read that failed with nothing on screen to keep, told by its own glyph,
/// title and next step.
internal struct PurchasesHomeFailureView: View {
    internal let failure: PurchasesHomeFailure
    internal let onAction: (PurchasesHomeFailureAction) -> Void

    internal var body: some View {
        ContentUnavailableView {
            Label(failure.title, systemImage: failure.symbol)
        } description: {
            Text(failure.message)
        } actions: {
            if let action = failure.action {
                Button(action.title) { onAction(action) }
                    .font(.popsHeadline)
                    .playgroundProminentGlassButton()
                    .tint(.popsPurchases)
            }
        }
    }
}

/// No purchases at all: the one screen where capture is the only thing to
/// do, so it offers the first of the four ways in beside the capture control.
internal struct PurchasesHomeEmptyView: View {
    internal let onScan: () -> Void

    internal var body: some View {
        ContentUnavailableView {
            Label {
                Text("No purchases")
            } icon: {
                Image(systemName: "receipt")
                    .foregroundStyle(Color.popsPurchases)
            }
        } description: {
            Text("Receipts you capture land here.")
        } actions: {
            Button("Scan a receipt", systemImage: "doc.viewfinder", action: onScan)
                .font(.popsHeadline)
                .playgroundProminentGlassButton()
                .tint(.popsPurchases)
        }
    }
}
